"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { createApproval } from "@/lib/approvals";
import { hoursBetween } from "@/lib/timesheets/overtime";
import { payPeriodFor } from "@/lib/payroll/engine";
import type { ActionResult } from "@/actions/people";

/** Finds or creates the employee's timesheet period containing `date`. */
async function ensurePeriod(employeeId: string, date = new Date()) {
  const { start, end } = payPeriodFor(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
  );
  return db.timesheetPeriod.upsert({
    where: { employeeId_periodStart: { employeeId, periodStart: start } },
    create: { employeeId, periodStart: start, periodEnd: end },
    update: {},
  });
}

export async function clockIn(): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const period = await ensurePeriod(user.employeeId);
    if (period.status !== "DRAFT") {
      return { ok: false, error: "This period is already submitted" };
    }
    const open = await db.timesheetEntry.findFirst({
      where: { period: { employeeId: user.employeeId }, clockIn: { not: null }, clockOut: null },
    });
    if (open) return { ok: false, error: "You're already clocked in" };
    const now = new Date();
    await db.timesheetEntry.create({
      data: {
        periodId: period.id,
        date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        clockIn: now,
        hours: 0,
      },
    });
    revalidatePath("/timesheets");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function clockOut(): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const open = await db.timesheetEntry.findFirst({
      where: { period: { employeeId: user.employeeId }, clockIn: { not: null }, clockOut: null },
    });
    if (!open?.clockIn) return { ok: false, error: "You're not clocked in" };
    const now = new Date();
    await db.timesheetEntry.update({
      where: { id: open.id },
      data: { clockOut: now, hours: hoursBetween(open.clockIn, now) },
    });
    revalidatePath("/timesheets");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

const manualSchema = z.object({
  date: z.string(),
  hours: z.coerce.number().positive().max(16),
  timeIn: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeOut: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  note: z.string().max(200).optional(),
});

export async function addManualEntry(
  input: z.infer<typeof manualSchema>,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const data = manualSchema.parse(input);
    const date = new Date(data.date + "T00:00:00Z");
    const period = await ensurePeriod(user.employeeId, date);
    if (period.status !== "DRAFT") {
      return { ok: false, error: "That period is already submitted" };
    }
    if (date < period.periodStart || date > period.periodEnd) {
      // ensurePeriod used the date itself, so this only trips on TZ edge cases
      return { ok: false, error: "Date is outside the current period" };
    }
    // when both clock times are given, they are the source of truth for hours
    let clockIn: Date | null = null;
    let clockOut: Date | null = null;
    let hours = data.hours;
    if (data.timeIn && data.timeOut) {
      clockIn = new Date(`${data.date}T${data.timeIn}:00Z`);
      clockOut = new Date(`${data.date}T${data.timeOut}:00Z`);
      if (clockOut <= clockIn) {
        return { ok: false, error: "Time out must be after time in" };
      }
      hours = hoursBetween(clockIn, clockOut);
      if (hours > 16) return { ok: false, error: "Shift can't be longer than 16 hours" };
    }
    await db.timesheetEntry.create({
      data: {
        periodId: period.id,
        date,
        clockIn,
        clockOut,
        hours,
        note: data.note?.trim() || null,
      },
    });
    revalidatePath("/timesheets");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function deleteEntry(entryId: string): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const entry = await db.timesheetEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: { period: true },
    });
    if (entry.period.employeeId !== user.employeeId && user.role !== "ADMIN") {
      throw new AuthzError("not your entry");
    }
    if (entry.period.status !== "DRAFT") {
      return { ok: false, error: "Period already submitted" };
    }
    await db.timesheetEntry.delete({ where: { id: entryId } });
    revalidatePath("/timesheets");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function submitPeriod(periodId: string): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const period = await db.timesheetPeriod.findUniqueOrThrow({
      where: { id: periodId },
      include: { entries: true },
    });
    if (period.employeeId !== user.employeeId) throw new AuthzError("not your timesheet");
    if (period.status !== "DRAFT") return { ok: false, error: "Already submitted" };
    if (period.entries.length === 0) return { ok: false, error: "No entries to submit" };
    const stillClocked = period.entries.some((e) => e.clockIn && !e.clockOut);
    if (stillClocked) return { ok: false, error: "Clock out before submitting" };

    await db.timesheetPeriod.update({
      where: { id: periodId },
      data: { status: "SUBMITTED" },
    });
    const total = Math.round(period.entries.reduce((a, e) => a + e.hours, 0) * 100) / 100;
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    await createApproval({
      type: "TIMESHEET",
      targetId: periodId,
      requester: { employeeId: user.employeeId, name: user.name },
      summary: `Timesheet ${fmt(period.periodStart)} – ${fmt(period.periodEnd)} (${total}h)`,
    });
    await audit(user, "TimesheetPeriod", periodId, "SUBMIT", { totalHours: total });
    revalidatePath("/timesheets");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
