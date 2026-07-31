// Time-off accrual engine. Balances are never stored — they are the sum of
// ledger entries. Scheduled accruals are materialized lazily (idempotent via
// the unique (employeeId, policyId, periodKey) constraint), so no cron exists.
// Pure functions here are unit-tested; DB wiring lives in materialize.ts.

export type AccrualMethod = "PER_PAY_PERIOD" | "ANNUAL_GRANT";

/**
 * Semi-monthly accrual periods: A = 1st-15th (accrues on the 15th),
 * B = 16th-end (accrues on the last day of the month).
 * Returns periods whose accrual date falls in (from, to], oldest first.
 */
export function perPayPeriodKeys(from: Date, to: Date): Array<{ key: string; date: Date }> {
  const out: Array<{ key: string; date: Date }> = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor <= to) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const mm = String(m + 1).padStart(2, "0");
    const aDate = new Date(Date.UTC(y, m, 15));
    const bDate = new Date(Date.UTC(y, m + 1, 0)); // last day of month
    if (aDate > from && aDate <= to) out.push({ key: `${y}-${mm}-A`, date: aDate });
    if (bDate > from && bDate <= to) out.push({ key: `${y}-${mm}-B`, date: bDate });
    cursor.setUTCMonth(m + 1);
  }
  return out;
}

/** Annual grants on Jan 1 of each year in (from, to]. */
export function annualGrantKeys(from: Date, to: Date): Array<{ key: string; date: Date }> {
  const out: Array<{ key: string; date: Date }> = [];
  for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
    const grant = new Date(Date.UTC(y, 0, 1));
    if (grant > from && grant <= to) out.push({ key: `grant-${y}`, date: grant });
  }
  return out;
}

export function accrualSchedule(
  method: AccrualMethod,
  from: Date,
  to: Date,
): Array<{ key: string; date: Date }> {
  return method === "PER_PAY_PERIOD"
    ? perPayPeriodKeys(from, to)
    : annualGrantKeys(from, to);
}

/** Business days (Mon-Fri) between two dates inclusive, minus holidays. */
export function businessDays(start: Date, end: Date, holidays: Date[]): number {
  const holidaySet = new Set(holidays.map((h) => h.toISOString().slice(0, 10)));
  let count = 0;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= stop) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidaySet.has(d.toISOString().slice(0, 10))) {
      count++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

export function sumLedger(entries: Array<{ amountHours: number }>): number {
  return Math.round(entries.reduce((acc, e) => acc + e.amountHours, 0) * 100) / 100;
}

/**
 * Year-end carryover: if the balance at Dec 31 exceeded the cap, the excess
 * is forfeited via a negative ADJUSTMENT dated Jan 1. Returns the adjustment
 * amount (negative) or 0 when no forfeiture applies.
 */
export function carryoverAdjustment(balanceAtYearEnd: number, capHours: number | null): number {
  if (capHours == null) return 0;
  if (balanceAtYearEnd <= capHours) return 0;
  return -Math.round((balanceAtYearEnd - capHours) * 100) / 100;
}
