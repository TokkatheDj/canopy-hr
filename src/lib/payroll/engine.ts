// Pure gross-to-net payroll simulation. All money is integer cents.
// Tax rates are deliberately simplified flat rates (stated in the README):
// federal 12%, state 5%, Social Security 6.2%, Medicare 1.45%.
// Pre-tax benefit deductions and 401(k) elections reduce taxable wages.

export const PERIODS_PER_YEAR = 24; // semi-monthly

export const TAX_RATES = [
  { label: "Federal Income Tax", rate: 0.12 },
  { label: "State Income Tax", rate: 0.05 },
  { label: "Social Security", rate: 0.062 },
  { label: "Medicare", rate: 0.0145 },
] as const;

export type EarningLine = {
  label: string;
  hours?: number;
  rateCents?: number;
  amountCents: number;
};

export type DeductionLine = {
  label: string;
  amountCents: number;
  preTax: boolean;
};

export type TaxLine = { label: string; rate: number; amountCents: number };

export type StubLines = {
  earnings: EarningLine[];
  deductions: DeductionLine[];
  taxes: TaxLine[];
  grossCents: number;
  preTaxDeductionCents: number;
  taxableCents: number;
  taxCents: number;
  netCents: number;
};

export type PayInput = {
  payType: "SALARY" | "HOURLY";
  /** SALARY: annual cents. HOURLY: cents per hour. */
  amountCents: number;
  /** HOURLY only: regular hours worked this period (OT already split out). */
  regularHours?: number;
  /** HOURLY only: overtime hours (paid at 1.5x). */
  overtimeHours?: number;
  /** Per-period pre-tax benefit costs (medical/dental/vision). */
  benefitDeductions?: Array<{ label: string; amountCents: number }>;
  /** 401(k) election as percent of gross (pre-tax). */
  retirementPct?: number;
};

function r(n: number): number {
  return Math.round(n);
}

export function computeStub(input: PayInput): StubLines {
  const earnings: EarningLine[] = [];

  if (input.payType === "SALARY") {
    earnings.push({
      label: "Salary",
      amountCents: r(input.amountCents / PERIODS_PER_YEAR),
    });
  } else {
    const reg = input.regularHours ?? 0;
    const ot = input.overtimeHours ?? 0;
    earnings.push({
      label: "Regular",
      hours: reg,
      rateCents: input.amountCents,
      amountCents: r(reg * input.amountCents),
    });
    if (ot > 0) {
      earnings.push({
        label: "Overtime (1.5x)",
        hours: ot,
        rateCents: r(input.amountCents * 1.5),
        amountCents: r(ot * input.amountCents * 1.5),
      });
    }
  }

  const grossCents = earnings.reduce((a, e) => a + e.amountCents, 0);

  const deductions: DeductionLine[] = [];
  for (const b of input.benefitDeductions ?? []) {
    deductions.push({ label: b.label, amountCents: b.amountCents, preTax: true });
  }
  if (input.retirementPct && input.retirementPct > 0) {
    deductions.push({
      label: `401(k) (${input.retirementPct}%)`,
      amountCents: r((grossCents * input.retirementPct) / 100),
      preTax: true,
    });
  }

  const preTaxDeductionCents = deductions
    .filter((d) => d.preTax)
    .reduce((a, d) => a + d.amountCents, 0);
  const taxableCents = Math.max(0, grossCents - preTaxDeductionCents);

  const taxes: TaxLine[] = TAX_RATES.map((t) => ({
    label: t.label,
    rate: t.rate,
    amountCents: r(taxableCents * t.rate),
  }));
  const taxCents = taxes.reduce((a, t) => a + t.amountCents, 0);

  const postTaxDeductionCents = deductions
    .filter((d) => !d.preTax)
    .reduce((a, d) => a + d.amountCents, 0);

  const netCents = grossCents - preTaxDeductionCents - taxCents - postTaxDeductionCents;

  return {
    earnings,
    deductions,
    taxes,
    grossCents,
    preTaxDeductionCents,
    taxableCents,
    taxCents,
    netCents,
  };
}

/** Semi-monthly pay period containing `date`: [1-15] or [16-end]. */
export function payPeriodFor(date: Date): { start: Date; end: Date; payDate: Date } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (date.getUTCDate() <= 15) {
    const end = new Date(Date.UTC(y, m, 15));
    return { start: new Date(Date.UTC(y, m, 1)), end, payDate: end };
  }
  const end = new Date(Date.UTC(y, m + 1, 0));
  return { start: new Date(Date.UTC(y, m, 16)), end, payDate: end };
}

/** The pay period immediately before the one containing `date`. */
export function previousPayPeriod(date: Date): { start: Date; end: Date; payDate: Date } {
  const { start } = payPeriodFor(date);
  const dayBefore = new Date(start.getTime() - 24 * 3600 * 1000);
  return payPeriodFor(dayBefore);
}
