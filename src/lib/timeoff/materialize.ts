// DB wiring for the accrual engine: lazily materializes scheduled accruals
// for an employee's policies up to "now". Safe to call on every read — the
// unique (employeeId, policyId, periodKey) constraint makes it idempotent.

import { db } from "@/lib/db";
import { accrualSchedule, accrualUntil, carryoverAdjustment, carryoverYears, sumLedger } from "./accrual";

// Carryover caps apply from this year-end on. They were never applied before Oct 2026, and
// applying them retroactively would cut balances people had already spent from.
export const FIRST_CAPPED_YEAR_END = new Date(Date.UTC(2026, 11, 31));

export async function materializeAccruals(employeeId: string, now = new Date()) {
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { endDate: true } });
  // Nothing accrues after an employee's last day (offboarding sets endDate).
  const until = accrualUntil(now, employee?.endDate);
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
    const schedule = accrualSchedule(a.policy.accrualMethod, from, until);
    if (schedule.length > 0) {
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

    // Year-end carryover cap: hours above the cap at Dec 31 are forfeited on Jan 1, as one
    // CARRYOVER entry per year (idempotent through its periodKey). Years in order, since each
    // forfeiture changes the next year's balance. Until Oct 2026 this was never applied.
    const cap = a.policy.carryoverCapHours;
    if (cap == null) continue;
    for (const year of carryoverYears(a.startDate, now, FIRST_CAPPED_YEAR_END)) {
      const yearEnd = new Date(Date.UTC(year, 11, 31));
      const upToYearEnd = await db.timeOffLedgerEntry.findMany({
        where: { employeeId, policyId: a.policyId, date: { lte: yearEnd } },
        select: { amountHours: true },
      });
      const adjustment = carryoverAdjustment(sumLedger(upToYearEnd), cap);
      if (adjustment === 0) continue;
      await db.timeOffLedgerEntry.createMany({
        data: [{
          employeeId,
          policyId: a.policyId,
          date: new Date(Date.UTC(year + 1, 0, 1)),
          amountHours: adjustment,
          kind: "CARRYOVER" as const,
          periodKey: `carryover-${year + 1}`,
        }],
        skipDuplicates: true,
      });
    }
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
  const endDate = (await db.employee.findUnique({ where: { id: employeeId }, select: { endDate: true } }))?.endDate;
  const assignments = await db.policyAssignment.findMany({
    where: { employeeId },
    include: { policy: true },
  });
  const out: PolicyBalance[] = [];
  for (const a of assignments) {
    // Accruals dated after an employee's last day don't count: before Oct 2026 they kept
    // accruing after offboarding. (Kept in the ledger, not deleted - just not counted.)
    const entries = await db.timeOffLedgerEntry.findMany({
      where: {
        employeeId,
        policyId: a.policyId,
        ...(endDate ? { NOT: { kind: "ACCRUAL", date: { gt: endDate } } } : {}),
      },
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
