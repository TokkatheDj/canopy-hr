// DB wiring for the accrual engine: lazily materializes scheduled accruals
// for an employee's policies up to "now". Safe to call on every read — the
// unique (employeeId, policyId, periodKey) constraint makes it idempotent.

import { db } from "@/lib/db";
import { accrualSchedule, sumLedger } from "./accrual";

export async function materializeAccruals(employeeId: string, now = new Date()) {
  const assignments = await db.policyAssignment.findMany({
    where: { employeeId },
    include: { policy: true },
  });

  for (const a of assignments) {
    // Accrue from the later of assignment start / most recent opening entry.
    const opening = await db.timeOffLedgerEntry.findFirst({
      where: { employeeId, policyId: a.policyId, kind: "ADJUSTMENT" },
      orderBy: { date: "desc" },
    });
    const from = opening && opening.date > a.startDate ? opening.date : a.startDate;
    const schedule = accrualSchedule(a.policy.accrualMethod, from, now);
    if (schedule.length === 0) continue;

    await db.timeOffLedgerEntry.createMany({
      data: schedule.map((s) => ({
        employeeId,
        policyId: a.policyId,
        date: s.date,
        amountHours: a.policy.accrualHours,
        kind: "ACCRUAL" as const,
        periodKey: s.key,
      })),
      skipDuplicates: true,
    });
  }
}

export type PolicyBalance = {
  policyId: string;
  policyName: string;
  type: string;
  balanceHours: number;
  accrualMethod: string;
  accrualHours: number;
};

export async function balancesFor(employeeId: string): Promise<PolicyBalance[]> {
  await materializeAccruals(employeeId);
  const assignments = await db.policyAssignment.findMany({
    where: { employeeId },
    include: { policy: true },
  });
  const out: PolicyBalance[] = [];
  for (const a of assignments) {
    const entries = await db.timeOffLedgerEntry.findMany({
      where: { employeeId, policyId: a.policyId },
      select: { amountHours: true },
    });
    out.push({
      policyId: a.policyId,
      policyName: a.policy.name,
      type: a.policy.type,
      balanceHours: sumLedger(entries),
      accrualMethod: a.policy.accrualMethod,
      accrualHours: a.policy.accrualHours,
    });
  }
  return out;
}
