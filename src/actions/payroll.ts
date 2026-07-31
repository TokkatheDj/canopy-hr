"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_ } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { currentAsOf } from "@/lib/history";
import { computeStub, payPeriodFor } from "@/lib/payroll/engine";
import { splitOvertime } from "@/lib/timesheets/overtime";
import type { ActionResult } from "@/actions/people";
import type { Prisma } from "@/generated/prisma/client";

/** Builds the per-period benefit deduction list for an employee. */
function benefitDeductionsFor(
  enrollments: Array<{
    tier: string | null;
    electionPct: number | null;
    active: boolean;
    plan: { name: string; type: string; tiers: unknown };
  }>,
): { deductions: Array<{ label: string; amountCents: number }>; retirementPct: number } {
  const deductions: Array<{ label: string; amountCents: number }> = [];
  let retirementPct = 0;
  for (const e of enrollments) {
    if (!e.active) continue;
    if (e.plan.type === "RETIREMENT") {
      retirementPct = e.electionPct ?? 0;
      continue;
    }
    const tiers = e.plan.tiers as Array<{ tier: string; employeeCostCentsPerPayPeriod: number }>;
    const tier = tiers.find((t) => t.tier === e.tier);
    if (tier) {
      deductions.push({ label: e.plan.name, amountCents: tier.employeeCostCentsPerPayPeriod });
    }
  }
  return { deductions, retirementPct };
}

export async function createDraftRun(): Promise<ActionResult & { runId?: string }> {
  try {
    const user = require_(await currentUser() ?? undefined, "payroll.manage");
    const schedule = await db.paySchedule.findFirstOrThrow();
    const now = new Date();
    const period = payPeriodFor(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    );

    const existing = await db.payrollRun.findUnique({
      where: {
        scheduleId_periodStart: { scheduleId: schedule.id, periodStart: period.start },
      },
    });
    if (existing) {
      return { ok: false, error: "A run for the current period already exists" };
    }

    const employees = await db.employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        compensations: true,
        enrollments: { include: { plan: true } },
        timesheetPeriods: {
          where: { periodStart: period.start, status: "APPROVED" },
          include: { entries: true },
        },
      },
    });

    const run = await db.payrollRun.create({
      data: {
        scheduleId: schedule.id,
        periodStart: period.start,
        periodEnd: period.end,
        payDate: period.payDate,
        status: "DRAFT",
      },
    });

    for (const emp of employees) {
      const comp = currentAsOf(emp.compensations, period.end);
      if (!comp) continue;
      const { deductions, retirementPct } = benefitDeductionsFor(emp.enrollments);

      let regularHours = 0;
      let overtimeHours = 0;
      if (comp.payType === "HOURLY") {
        const entries = emp.timesheetPeriods.flatMap((p) =>
          p.entries.map((e) => ({ date: e.date, hours: e.hours })),
        );
        const split = splitOvertime(entries);
        regularHours = split.regularHours;
        overtimeHours = split.overtimeHours;
      }

      const lines = computeStub({
        payType: comp.payType,
        amountCents: comp.amountCents,
        regularHours,
        overtimeHours,
        benefitDeductions: deductions,
        retirementPct,
      });

      await db.payStub.create({
        data: {
          runId: run.id,
          employeeId: emp.id,
          lines: lines as unknown as Prisma.InputJsonValue,
          grossCents: lines.grossCents,
          netCents: lines.netCents,
        },
      });
    }

    await audit(user, "PayrollRun", run.id, "CREATE", {
      period: `${period.start.toISOString().slice(0, 10)} – ${period.end.toISOString().slice(0, 10)}`,
    });
    revalidatePath("/payroll");
    return { ok: true, runId: run.id };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function deleteDraftRun(runId: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "payroll.manage");
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== "DRAFT") return { ok: false, error: "Only drafts can be deleted" };
    await db.payrollRun.delete({ where: { id: runId } });
    await audit(user, "PayrollRun", runId, "DELETE");
    revalidatePath("/payroll");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function approveRun(runId: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "payroll.manage");
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== "DRAFT") return { ok: false, error: "Run is not a draft" };
    await db.payrollRun.update({
      where: { id: runId },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    await audit(user, "PayrollRun", runId, "APPROVE");
    revalidatePath("/payroll");
    revalidatePath(`/payroll/${runId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function markRunPaid(runId: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "payroll.manage");
    const run = await db.payrollRun.findUniqueOrThrow({
      where: { id: runId },
      include: { stubs: { include: { employee: { include: { user: true } } } } },
    });
    if (run.status !== "APPROVED") {
      return { ok: false, error: "Approve the run before marking it paid" };
    }
    await db.payrollRun.update({
      where: { id: runId },
      data: { status: "PAID", paidAt: new Date() },
    });
    // Notify employees who have logins that their stub is ready
    for (const stub of run.stubs) {
      const stubUser = stub.employee.user;
      if (stubUser) {
        await db.notification.create({
          data: {
            userId: stubUser.id,
            title: "Pay stub available",
            body: `Your ${run.payDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} pay stub is ready.`,
            href: `/payroll/stubs/${stub.id}`,
          },
        });
      }
    }
    await audit(user, "PayrollRun", runId, "MARK_PAID");
    revalidatePath("/payroll");
    revalidatePath(`/payroll/${runId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
