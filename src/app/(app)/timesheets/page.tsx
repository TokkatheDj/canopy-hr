import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { payPeriodFor } from "@/lib/payroll/engine";
import { splitOvertime } from "@/lib/timesheets/overtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClockButtons,
  AddEntryDialog,
  DeleteEntryButton,
  SubmitPeriodButton,
} from "./timesheet-client";

export const metadata = { title: "Timesheets" };

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  SUBMITTED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default async function TimesheetsPage() {
  const user = await currentUser();
  if (!user?.employeeId) {
    return <p className="text-muted-foreground">No employee record linked.</p>;
  }

  const now = new Date();
  const { start } = payPeriodFor(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );

  const period = await db.timesheetPeriod.findUnique({
    where: { employeeId_periodStart: { employeeId: user.employeeId, periodStart: start } },
    include: { entries: { orderBy: [{ date: "asc" }, { clockIn: "asc" }] } },
  });

  const history = await db.timesheetPeriod.findMany({
    where: { employeeId: user.employeeId, periodStart: { not: start } },
    include: { entries: { select: { hours: true } } },
    orderBy: { periodStart: "desc" },
    take: 6,
  });

  const entries = period?.entries ?? [];
  const openEntry = entries.find((e) => e.clockIn && !e.clockOut);
  const totalHours = Math.round(entries.reduce((a, e) => a + e.hours, 0) * 100) / 100;
  const split = splitOvertime(entries.map((e) => ({ date: e.date, hours: e.hours })));

  const fmtRange = (s: Date, e: Date) =>
    `${s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;

  const periodInfo = payPeriodFor(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timesheets</h1>
          <p className="text-sm text-muted-foreground">
            Current period: {fmtRange(periodInfo.start, periodInfo.end)}
            {period && (
              <Badge className={`ml-2 ${STATUS_STYLE[period.status]}`}>
                {period.status.toLowerCase()}
              </Badge>
            )}
          </p>
        </div>
        <ClockButtons
          clockedIn={Boolean(openEntry)}
          clockedInSince={openEntry?.clockIn?.toISOString() ?? null}
          periodEditable={!period || period.status === "DRAFT"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">{totalHours}h</div>
            <div className="text-sm text-muted-foreground">Total this period</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">{split.regularHours}h</div>
            <div className="text-sm text-muted-foreground">Regular</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">{split.overtimeHours}h</div>
            <div className="text-sm text-muted-foreground">Overtime (&gt;40h/wk)</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Entries</CardTitle>
          <div className="flex gap-2">
            {(!period || period.status === "DRAFT") && <AddEntryDialog />}
            {period && period.status === "DRAFT" && entries.length > 0 && (
              <SubmitPeriodButton periodId={period.id} />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No entries yet — clock in or add hours manually.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{fmtDate(e.date)}</TableCell>
                    <TableCell>{fmtTime(e.clockIn)}</TableCell>
                    <TableCell>
                      {e.clockIn && !e.clockOut ? (
                        <Badge className="bg-emerald-100 text-emerald-800">
                          on the clock
                        </Badge>
                      ) : (
                        fmtTime(e.clockOut)
                      )}
                    </TableCell>
                    <TableCell>{e.hours > 0 ? `${e.hours}h` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.note ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {period?.status === "DRAFT" && !(e.clockIn && !e.clockOut) && (
                        <DeleteEntryButton entryId={e.id} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past periods</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {history.map((p) => {
                const total =
                  Math.round(p.entries.reduce((a, e) => a + e.hours, 0) * 100) / 100;
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>{fmtRange(p.periodStart, p.periodEnd)}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-muted-foreground">{total}h</span>
                      <Badge className={STATUS_STYLE[p.status]}>
                        {p.status.toLowerCase()}
                      </Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
