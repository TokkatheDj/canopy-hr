import { describe, expect, it } from "vitest";
import {
  perPayPeriodKeys,
  annualGrantKeys,
  businessDays,
  sumLedger,
  carryoverAdjustment,
} from "./accrual";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("perPayPeriodKeys", () => {
  it("emits A on the 15th and B on the last day of each month", () => {
    const keys = perPayPeriodKeys(d("2026-01-01"), d("2026-02-28"));
    expect(keys.map((k) => k.key)).toEqual([
      "2026-01-A",
      "2026-01-B",
      "2026-02-A",
      "2026-02-B",
    ]);
    expect(keys[1].date.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(keys[3].date.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("excludes the from-date itself (half-open interval)", () => {
    const keys = perPayPeriodKeys(d("2026-01-15"), d("2026-01-31"));
    expect(keys.map((k) => k.key)).toEqual(["2026-01-B"]);
  });

  it("returns nothing when the window contains no accrual dates", () => {
    expect(perPayPeriodKeys(d("2026-03-01"), d("2026-03-10"))).toEqual([]);
  });

  it("handles leap-year February", () => {
    const keys = perPayPeriodKeys(d("2028-02-01"), d("2028-03-01"));
    expect(keys[1].date.toISOString().slice(0, 10)).toBe("2028-02-29");
  });
});

describe("annualGrantKeys", () => {
  it("grants once per Jan 1 inside the window", () => {
    const keys = annualGrantKeys(d("2025-06-01"), d("2027-02-01"));
    expect(keys.map((k) => k.key)).toEqual(["grant-2026", "grant-2027"]);
  });

  it("excludes a grant exactly at the from-date", () => {
    expect(annualGrantKeys(d("2026-01-01"), d("2026-06-01"))).toEqual([]);
  });
});

describe("businessDays", () => {
  it("counts weekdays only", () => {
    // Mon Aug 3 2026 - Fri Aug 7 2026
    expect(businessDays(d("2026-08-03"), d("2026-08-07"), [])).toBe(5);
  });

  it("excludes weekends across a week boundary", () => {
    // Fri Aug 7 - Mon Aug 10 => Fri + Mon
    expect(businessDays(d("2026-08-07"), d("2026-08-10"), [])).toBe(2);
  });

  it("excludes holidays", () => {
    expect(
      businessDays(d("2026-11-25"), d("2026-11-27"), [d("2026-11-26"), d("2026-11-27")]),
    ).toBe(1);
  });

  it("single weekend day is zero", () => {
    expect(businessDays(d("2026-08-08"), d("2026-08-08"), [])).toBe(0);
  });
});

describe("sumLedger", () => {
  it("sums credits and debits with cent precision", () => {
    expect(
      sumLedger([{ amountHours: 5 }, { amountHours: 5 }, { amountHours: -8 }]),
    ).toBe(2);
  });
  it("avoids float drift", () => {
    expect(sumLedger([{ amountHours: 0.1 }, { amountHours: 0.2 }])).toBe(0.3);
  });
});

describe("carryoverAdjustment", () => {
  it("forfeits hours above the cap", () => {
    expect(carryoverAdjustment(56, 40)).toBe(-16);
  });
  it("no cap means no forfeiture", () => {
    expect(carryoverAdjustment(200, null)).toBe(0);
  });
  it("under the cap is untouched", () => {
    expect(carryoverAdjustment(24, 40)).toBe(0);
  });
});
