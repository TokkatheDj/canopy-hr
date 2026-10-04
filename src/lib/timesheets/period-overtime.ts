import { db } from "@/lib/db";
import { splitOvertime, workweekStart, type DayHours, type OvertimeSplit } from "./overtime";

/**
 * Regular/overtime hours for one timesheet period, counted per workweek like payroll does:
 * if the period starts mid-week, that week's earlier days (from the previous period) are
 * loaded so the running total is right. The timesheet pages use this so a manager approving
 * a period sees the same overtime the pay stub will pay.
 */
export async function periodOvertime(
  employeeId: string,
  from: Date,
  to: Date,
  entries: DayHours[],
): Promise<OvertimeSplit> {
  const weekStart = workweekStart(from);
  const earlier =
    weekStart < from
      ? await db.timesheetEntry.findMany({
          where: { period: { employeeId }, date: { gte: weekStart, lt: from } },
          select: { date: true, hours: true },
        })
      : [];
  return splitOvertime([...earlier, ...entries], 40, { from, to });
}
