// Overtime split: hours beyond 40 in a workweek (Sun–Sat) are overtime.
// Pure function, unit tested.

export type DayHours = { date: Date; hours: number };

export type OvertimeSplit = { regularHours: number; overtimeHours: number };

/** Key that groups a date into its Sun-Sat workweek (the week's Sunday). */
function weekKey(d: Date): string {
  const sunday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()),
  );
  return sunday.toISOString().slice(0, 10);
}

/** The Sunday that starts `d`'s workweek - load entries from here when a period starts mid-week. */
export function workweekStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()));
}

/**
 * Split hours into regular and overtime.
 *
 * Each workweek is walked day by day, and hours become overtime on the day the week's running
 * total passes the threshold. With `period`, only days inside it are counted - but the earlier
 * days of a workweek that started before the period must be passed in too, so the running total
 * is right. Pay periods are semi-monthly and a workweek often straddles the 15th or month-end:
 * counting each period's days on their own, a 50-hour week split 25/25 paid no overtime at all.
 */
export function splitOvertime(
  entries: DayHours[],
  weeklyThreshold = 40,
  period?: { from: Date; to: Date },
): OvertimeSplit {
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
  const weekSoFar = new Map<string, number>();
  let regular = 0;
  let overtime = 0;
  for (const e of sorted) {
    const key = weekKey(e.date);
    const before = weekSoFar.get(key) ?? 0;
    weekSoFar.set(key, before + e.hours);
    const reg = Math.max(0, Math.min(e.hours, weeklyThreshold - before));
    if (period && (e.date < period.from || e.date > period.to)) continue;
    regular += reg;
    overtime += e.hours - reg;
  }
  return {
    regularHours: Math.round(regular * 100) / 100,
    overtimeHours: Math.round(overtime * 100) / 100,
  };
}

export function hoursBetween(clockIn: Date, clockOut: Date): number {
  return Math.round(((clockOut.getTime() - clockIn.getTime()) / 3600000) * 100) / 100;
}
