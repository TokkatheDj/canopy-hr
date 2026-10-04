import { describe, expect, it } from "vitest";
import { splitOvertime, hoursBetween } from "./overtime";

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("splitOvertime across a pay-period boundary", () => {
  // Pay periods are semi-monthly (1-15, 16-end) but overtime is per Sun-Sat workweek, so a week
  // often straddles two periods. Sun Jul 12 - Sat Jul 18, 2026 crosses the 15th.
  const week = [
    { date: d("2026-07-13"), hours: 10 }, // Mon  - period 1
    { date: d("2026-07-14"), hours: 10 }, // Tue  - period 1
    { date: d("2026-07-15"), hours: 10 }, // Wed  - period 1
    { date: d("2026-07-16"), hours: 10 }, // Thu  - period 2
    { date: d("2026-07-17"), hours: 10 }, // Fri  - period 2 (week total 50)
  ];
  const p1 = { from: d("2026-07-01"), to: d("2026-07-15") };
  const p2 = { from: d("2026-07-16"), to: d("2026-07-31") };

  it("keeps the week's overtime: hours past 40 are paid in the period they were worked", () => {
    expect(splitOvertime(week, 40, p1)).toEqual({ regularHours: 30, overtimeHours: 0 });
    expect(splitOvertime(week, 40, p2)).toEqual({ regularHours: 10, overtimeHours: 10 });
  });

  it("is overtime from the day the 40th hour passes, even before the boundary", () => {
    const heavy = [
      { date: d("2026-07-13"), hours: 15 },
      { date: d("2026-07-14"), hours: 15 },
      { date: d("2026-07-15"), hours: 15 }, // 45 by the 15th
      { date: d("2026-07-16"), hours: 8 },
    ];
    expect(splitOvertime(heavy, 40, p1)).toEqual({ regularHours: 40, overtimeHours: 5 });
    expect(splitOvertime(heavy, 40, p2)).toEqual({ regularHours: 0, overtimeHours: 8 });
  });

  it("the two periods together pay exactly the week's 40 regular + 10 overtime", () => {
    const a = splitOvertime(week, 40, p1), b = splitOvertime(week, 40, p2);
    expect(a.regularHours + b.regularHours).toBe(40);
    expect(a.overtimeHours + b.overtimeHours).toBe(10);
  });
});

describe("splitOvertime", () => {
  it("under 40 hours is all regular", () => {
    const split = splitOvertime([
      { date: d("2026-07-20"), hours: 8 }, // Mon
      { date: d("2026-07-21"), hours: 8 },
      { date: d("2026-07-22"), hours: 8 },
      { date: d("2026-07-23"), hours: 8 },
    ]);
    expect(split).toEqual({ regularHours: 32, overtimeHours: 0 });
  });

  it("over 40 in one week splits into OT", () => {
    const split = splitOvertime([
      { date: d("2026-07-20"), hours: 10 },
      { date: d("2026-07-21"), hours: 10 },
      { date: d("2026-07-22"), hours: 10 },
      { date: d("2026-07-23"), hours: 10 },
      { date: d("2026-07-24"), hours: 5 },
    ]);
    expect(split).toEqual({ regularHours: 40, overtimeHours: 5 });
  });

  it("weeks are independent (no OT when split across two weeks)", () => {
    const split = splitOvertime([
      // Fri Jul 24 and Mon Jul 27 are different Sun-Sat weeks
      { date: d("2026-07-24"), hours: 30 },
      { date: d("2026-07-27"), hours: 30 },
    ]);
    expect(split).toEqual({ regularHours: 60, overtimeHours: 0 });
  });

  it("Sunday belongs to the week it starts", () => {
    const split = splitOvertime([
      { date: d("2026-07-26"), hours: 30 }, // Sunday
      { date: d("2026-07-27"), hours: 20 }, // Monday same week
    ]);
    expect(split).toEqual({ regularHours: 40, overtimeHours: 10 });
  });
});

describe("hoursBetween", () => {
  it("computes fractional hours", () => {
    expect(
      hoursBetween(d("2026-07-20") , new Date("2026-07-20T07:30:00Z")),
    ).toBe(7.5);
  });
});
