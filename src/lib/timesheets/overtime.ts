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

export function splitOvertime(entries: DayHours[], weeklyThreshold = 40): OvertimeSplit {
  const weeks = new Map<string, number>();
  for (const e of entries) {
    const key = weekKey(e.date);
    weeks.set(key, (weeks.get(key) ?? 0) + e.hours);
  }
  let regular = 0;
  let overtime = 0;
  for (const total of weeks.values()) {
    regular += Math.min(total, weeklyThreshold);
    overtime += Math.max(0, total - weeklyThreshold);
  }
  return {
    regularHours: Math.round(regular * 100) / 100,
    overtimeHours: Math.round(overtime * 100) / 100,
  };
}

export function hoursBetween(clockIn: Date, clockOut: Date): number {
  return Math.round(((clockOut.getTime() - clockIn.getTime()) / 3600000) * 100) / 100;
}
