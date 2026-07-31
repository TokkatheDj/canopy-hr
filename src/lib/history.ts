// Effective-dated history helpers. JobInfo/Compensation are append-only;
// "current" = the row with the greatest effectiveDate <= asOf.

type Dated = { effectiveDate: Date };

export function currentAsOf<T extends Dated>(rows: T[], asOf = new Date()): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.effectiveDate <= asOf && (!best || row.effectiveDate > best.effectiveDate)) {
      best = row;
    }
  }
  return best;
}

export function sortedHistory<T extends Dated>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime(),
  );
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function formatPay(payType: "HOURLY" | "SALARY", amountCents: number): string {
  return payType === "SALARY"
    ? `${formatMoney(amountCents)}/yr`
    : `${formatMoney(amountCents)}/hr`;
}
