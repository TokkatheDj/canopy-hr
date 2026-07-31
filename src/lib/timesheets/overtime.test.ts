import { describe, expect, it } from "vitest";
import { splitOvertime, hoursBetween } from "./overtime";

const d = (s: string) => new Date(s + "T00:00:00Z");

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
