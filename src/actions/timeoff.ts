"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { createApproval } from "@/lib/approvals";
import { businessDays } from "@/lib/timeoff/accrual";
import { balancesFor } from "@/lib/timeoff/materialize";
import type { ActionResult } from "@/actions/people";

const requestSchema = z.object({
  policyId: z.string(),
  startDate: z.string(), // yyyy-mm-dd
  endDate: z.string(),
  hoursPerDay: z.coerce.number().positive().max(12),
  reason: z.string().max(300).optional(),
});

export async function requestTimeOff(
  input: z.infer<typeof requestSchema>,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const data = requestSchema.parse(input);

    const start = new Date(data.startDate + "T00:00:00Z");
    const end = new Date(data.endDate + "T00:00:00Z");
    if (end < start) return { ok: false, error: "End date is before start date" };

    const holidays = await db.holiday.findMany();
    const days = businessDays(start, end, holidays.map((h) => h.date));
    if (days === 0) {
      return { ok: false, error: "No working days in that range" };
    }
    const totalHours = Math.round(days * data.hoursPerDay * 100) / 100;

    const balances = await balancesFor(user.employeeId);
    const balance = balances.find((b) => b.policyId === data.policyId);
    if (!balance) return { ok: false, error: "You aren't assigned to that policy" };
    if (balance.balanceHours < totalHours) {
      return {
        ok: false,
        error: `Not enough ${balance.policyName} balance (${balance.balanceHours}h available, ${totalHours}h requested)`,
      };
    }

    // Pending requests also count against the balance
    const pending = await db.timeOffRequest.aggregate({
      where: { employeeId: user.employeeId, policyId: data.policyId, status: "PENDING" },
      _sum: { totalHours: true },
    });
    const pendingHours = pending._sum.totalHours ?? 0;
    if (balance.balanceHours - pendingHours < totalHours) {
      return {
        ok: false,
        error: `You already have ${pendingHours}h pending against this balance`,
      };
    }

    const req = await db.timeOffRequest.create({
      data: {
        employeeId: user.employeeId,
        policyId: data.policyId,
        startDate: start,
        endDate: end,
        hoursPerDay: data.hoursPerDay,
        totalHours,
        reason: data.reason?.trim() || null,
      },
    });

    const fmt = (dt: Date) =>
      dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    await createApproval({
      type: "TIME_OFF",
      targetId: req.id,
      requester: { employeeId: user.employeeId, name: user.name },
      summary: `${balance.policyName} ${fmt(start)} – ${fmt(end)} (${totalHours}h)`,
    });
    await audit(user, "TimeOffRequest", req.id, "CREATE", {
      policy: balance.policyName,
      totalHours,
    });

    revalidatePath("/time-off");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function cancelTimeOffRequest(requestId: string): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const req = await db.timeOffRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (req.employeeId !== user.employeeId && user.role !== "ADMIN") {
      throw new AuthzError("not your request");
    }
    if (req.status !== "PENDING") {
      return { ok: false, error: "Only pending requests can be canceled" };
    }
    await db.timeOffRequest.update({
      where: { id: requestId },
      data: { status: "CANCELED" },
    });
    await db.approvalRequest.updateMany({
      where: { type: "TIME_OFF", targetId: requestId, status: "PENDING" },
      data: { status: "CANCELED", resolvedAt: new Date() },
    });
    await audit(user, "TimeOffRequest", requestId, "CANCEL");
    revalidatePath("/time-off");
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
