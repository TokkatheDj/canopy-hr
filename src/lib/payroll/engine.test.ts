import { describe, expect, it } from "vitest";
import { computeStub, payPeriodFor, previousPayPeriod } from "./engine";

describe("computeStub — salary", () => {
  it("splits an annual salary into 24 periods and taxes it", () => {
    // $96,000/yr → $4,000/period
    const stub = computeStub({ payType: "SALARY", amountCents: 9_600_000 });
    expect(stub.grossCents).toBe(400_000);
    expect(stub.taxableCents).toBe(400_000);
    // 12% + 5% + 6.2% + 1.45% = 24.65% → $986.00
    expect(stub.taxCents).toBe(98_600);
    expect(stub.netCents).toBe(301_400);
  });

  it("pre-tax benefits reduce taxable wages", () => {
    const stub = computeStub({
      payType: "SALARY",
      amountCents: 9_600_000,
      benefitDeductions: [{ label: "Medical", amountCents: 20_000 }],
    });
    expect(stub.taxableCents).toBe(380_000);
    expect(stub.taxCents).toBe(Math.round(380_000 * 0.2465));
    expect(stub.netCents).toBe(400_000 - 20_000 - stub.taxCents);
  });

  it("401(k) percent comes off the top pre-tax", () => {
    const stub = computeStub({
      payType: "SALARY",
      amountCents: 9_600_000,
      retirementPct: 5,
    });
    const k401 = stub.deductions.find((d) => d.label.startsWith("401(k)"));
    expect(k401?.amountCents).toBe(20_000);
    expect(stub.taxableCents).toBe(380_000);
  });
});

describe("computeStub — hourly", () => {
  it("pays regular hours at rate", () => {
    const stub = computeStub({
      payType: "HOURLY",
      amountCents: 2_000, // $20/hr
      regularHours: 80,
    });
    expect(stub.grossCents).toBe(160_000);
  });

  it("pays overtime at 1.5x", () => {
    const stub = computeStub({
      payType: "HOURLY",
      amountCents: 2_000,
      regularHours: 80,
      overtimeHours: 10,
    });
    // 80*$20 + 10*$30 = $1,900
    expect(stub.grossCents).toBe(190_000);
    const ot = stub.earnings.find((e) => e.label.includes("Overtime"));
    expect(ot?.amountCents).toBe(30_000);
    expect(ot?.rateCents).toBe(3_000);
  });

  it("zero hours produces a zero stub, not negative", () => {
    const stub = computeStub({ payType: "HOURLY", amountCents: 2_000 });
    expect(stub.grossCents).toBe(0);
    expect(stub.netCents).toBe(0);
  });
});

describe("payPeriodFor", () => {
  const d = (s: string) => new Date(s + "T00:00:00Z");

  it("first half of the month is 1-15", () => {
    const p = payPeriodFor(d("2026-07-08"));
    expect(p.start.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(p.end.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("second half runs 16 to month end", () => {
    const p = payPeriodFor(d("2026-07-31"));
    expect(p.start.toISOString().slice(0, 10)).toBe("2026-07-16");
    expect(p.end.toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("handles February month-end", () => {
    const p = payPeriodFor(d("2026-02-20"));
    expect(p.end.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("previousPayPeriod crosses month boundaries", () => {
    const p = previousPayPeriod(d("2026-07-08"));
    expect(p.start.toISOString().slice(0, 10)).toBe("2026-06-16");
    expect(p.end.toISOString().slice(0, 10)).toBe("2026-06-30");
  });
});
