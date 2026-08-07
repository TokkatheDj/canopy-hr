// Polymorphic approval engine. One ApprovalRequest model + one inbox serves
// every module: steps are acted on in order; the final approval applies the
// side effect for the request's type.

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/authz";
import type { ApprovalType, Prisma } from "@/generated/prisma/client";

export type ApprovalStep = {
  approverId: string; // Employee id
  approverName: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  actedAt?: string;
};

export type InfoChangePayload = {
  employeeId: string;
  changes: Array<{ field: string; label: string; oldValue: string; newValue: string }>;
};

/** Fields an employee may request to change about themselves. */
export const SELF_EDITABLE_FIELDS = [
  "preferredName",
  "personalEmail",
  "phone",
  "address",
  "city",
  "state",
  "zip",
] as const;

/**
 * Approver chain for an employee: their manager (if any), then an HR admin.
 * Deduplicated (a manager who IS the admin appears once).
 */
export async function buildApproverChain(employeeId: string): Promise<ApprovalStep[]> {
  const emp = await db.employee.findUniqueOrThrow({
    where: { id: employeeId },
    include: { manager: true },
  });
  const adminUser = await db.user.findFirst({
    where: { role: "ADMIN", employeeId: { not: null } },
    include: { employee: true },
  });

  const steps: ApprovalStep[] = [];
  if (emp.manager) {
    steps.push({
      approverId: emp.manager.id,
      approverName: `${emp.manager.firstName} ${emp.manager.lastName}`,
      status: "PENDING",
    });
  }
  if (adminUser?.employee && adminUser.employee.id !== emp.manager?.id) {
    steps.push({
      approverId: adminUser.employee.id,
      approverName: `${adminUser.employee.firstName} ${adminUser.employee.lastName}`,
      status: "PENDING",
    });
  }
  return steps;
}

async function notifyEmployee(employeeId: string, title: string, body: string, href: string) {
  const user = await db.user.findUnique({ where: { employeeId } });
  if (!user) return; // most seeded employees have no login — that's fine
  await db.notification.create({ data: { userId: user.id, title, body, href } });
}

export async function createApproval(opts: {
  type: ApprovalType;
  requester: { employeeId: string; name: string };
  summary: string;
  targetId?: string;
  payload?: Prisma.InputJsonValue;
}) {
  const steps = await buildApproverChain(opts.requester.employeeId);
  const approval = await db.approvalRequest.create({
    data: {
      type: opts.type,
      targetId: opts.targetId,
      payload: opts.payload,
      requesterId: opts.requester.employeeId,
      requesterName: opts.requester.name,
      summary: opts.summary,
      steps: steps as unknown as Prisma.InputJsonValue,
      // No approvers configured (e.g. CEO) → auto-approve immediately
      status: steps.length === 0 ? "APPROVED" : "PENDING",
      resolvedAt: steps.length === 0 ? new Date() : null,
    },
  });
  if (steps.length === 0) {
    await applyApprovalEffect(approval.id);
  } else {
    await notifyEmployee(
      steps[0].approverId,
      "Approval needed",
      `${opts.requester.name}: ${opts.summary}`,
      "/inbox",
    );
  }
  return approval;
}

/**
 * Acts on the current pending step. Only the step's approver (or an ADMIN)
 * may act. Returns the updated approval.
 */
export async function actOnApproval(
  approvalId: string,
  actor: SessionUser,
  decision: "APPROVED" | "DENIED",
) {
  const approval = await db.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
  });
  if (approval.status !== "PENDING") throw new Error("Request already resolved");

  const steps = approval.steps as unknown as ApprovalStep[];
  const idx = steps.findIndex((s) => s.status === "PENDING");
  if (idx === -1) throw new Error("No pending step");
  const step = steps[idx];
  const isApprover = actor.employeeId === step.approverId;
  if (!isApprover && actor.role !== "ADMIN") {
    throw new Error("Not your approval to act on");
  }

  steps[idx] = { ...step, status: decision, actedAt: new Date().toISOString() };
  const done = decision === "DENIED" || idx === steps.length - 1;
  const finalStatus = decision === "DENIED" ? "DENIED" : done ? "APPROVED" : "PENDING";

  // Compare-and-swap, not a plain update. The status check above is a READ;
  // between it and this write another approver can pass the very same check.
  // That is not a freak race here: the inbox deliberately shows every pending
  // request to admins, so a manager and an admin deciding at the same moment
  // is the designed workflow. Both used to pass, both used to reach
  // applyApprovalEffect, and a TIME_OFF request was debited from the ledger
  // twice. Re-stating `status: "PENDING"` in the where clause makes the
  // database decide the winner: the loser matches zero rows.
  const { count } = await db.approvalRequest.updateMany({
    where: { id: approvalId, status: "PENDING" },
    data: {
      steps: steps as unknown as Prisma.InputJsonValue,
      status: finalStatus,
      resolvedAt: done ? new Date() : null,
    },
  });
  if (count === 0) throw new Error("Request already resolved");
  const updated = await db.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
  });

  await audit(actor, "ApprovalRequest", approvalId, decision, {
    type: approval.type,
    summary: approval.summary,
  });

  if (!done) {
    await notifyEmployee(
      steps[idx + 1].approverId,
      "Approval needed",
      `${approval.requesterName}: ${approval.summary}`,
      "/inbox",
    );
  } else {
    if (finalStatus === "APPROVED") await applyApprovalEffect(approvalId);
    if (finalStatus === "DENIED") await applyDenialEffect(approvalId);
    await notifyEmployee(
      approval.requesterId,
      finalStatus === "APPROVED" ? "Request approved" : "Request denied",
      approval.summary,
      "/inbox",
    );
  }
  return updated;
}

/** Side effect of a fully-approved request, by type. */
async function applyApprovalEffect(approvalId: string) {
  const approval = await db.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
  });

  switch (approval.type) {
    case "INFO_CHANGE": {
      const payload = approval.payload as unknown as InfoChangePayload;
      const data: Record<string, string> = {};
      for (const c of payload.changes) {
        if ((SELF_EDITABLE_FIELDS as readonly string[]).includes(c.field)) {
          data[c.field] = c.newValue;
        }
      }
      await db.employee.update({ where: { id: payload.employeeId }, data });
      await audit(null, "Employee", payload.employeeId, "UPDATE", {
        via: "approved info change",
        changes: payload.changes,
      });
      break;
    }
    case "TIME_OFF": {
      if (!approval.targetId) break;
      const req = await db.timeOffRequest.update({
        where: { id: approval.targetId },
        data: { status: "APPROVED" },
      });
      // Debit the ledger for the approved hours.
      //
      // Keyed so the DATABASE refuses a second debit, not just the caller.
      // periodKey is already the accrual idempotency key and is covered by
      // @@unique([employeeId, policyId, periodKey]) — see materialize.ts,
      // which relies on the same constraint. The "usage:" prefix namespaces
      // these apart from accrual keys like "2026-P14". Balances are a plain
      // sum over every entry, so carrying a key here changes no arithmetic.
      //
      // The compare-and-swap in actOnApproval should already make a duplicate
      // impossible; this is the backstop that survives a retry, a double
      // submit, or a future caller that forgets the invariant. Money-like
      // ledgers get belt and braces.
      await db.timeOffLedgerEntry.createMany({
        data: [
          {
            employeeId: req.employeeId,
            policyId: req.policyId,
            date: req.startDate,
            amountHours: -req.totalHours,
            kind: "USAGE",
            periodKey: `usage:${req.id}`,
            note: `Approved time off ${req.startDate.toISOString().slice(0, 10)} – ${req.endDate.toISOString().slice(0, 10)}`,
          },
        ],
        skipDuplicates: true,
      });
      break;
    }
    case "TIMESHEET": {
      if (!approval.targetId) break;
      await db.timesheetPeriod.update({
        where: { id: approval.targetId },
        data: { status: "APPROVED" },
      });
      break;
    }
    case "OFFER": {
      // Offer approval has no automatic side effect; hiring flow handles it.
      break;
    }
  }
}

/** Marks the underlying record when an approval is denied. */
export async function applyDenialEffect(approvalId: string) {
  const approval = await db.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
  });
  if (approval.type === "TIME_OFF" && approval.targetId) {
    await db.timeOffRequest.update({
      where: { id: approval.targetId },
      data: { status: "DENIED" },
    });
  }
}
