import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { splitOvertime } from "@/lib/timesheets/overtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Timesheet detail" };

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

export default async function TimesheetDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  const period = await db.timesheetPeriod.findUnique({
    where: { id: periodId },
    include: {
      employee: true,
      entries: { orderBy: [{ date: "asc" }, { clockIn: "asc" }] },
    },
  });
  if (!period) notFound();

  const allowed =
    user.role === "ADMIN" ||
    user.employeeId === period.employeeId ||
    user.employeeId === period.employee.managerId;
  if (!allowed) redirect("/timesheets");

  const totalHours =
    Math.round(period.entries.reduce((a, e) => a + e.hours, 0) * 100) / 100;
  const split = splitOvertime(
    period.entries.map((e) => ({ date: e.date, hours: e.hours })),
  );
  const fmtRange = (s: Date, e: Date) =>
    `${s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/inbox" aria-label="Back to inbox" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {period.employee.firstName} {period.employee.lastName} — timesheet
          </h1>
          <p className="text-sm text-muted-foreground">
            {fmtRange(period.periodStart, period.periodEnd)}
            <Badge className={`ml-2 ${STATUS_STYLE[period.status]}`}>
              {period.status.toLowerCase()}
            </Badge>
          </p>
        </div>
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
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {period.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {period.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{fmtDate(e.date)}</TableCell>
                    <TableCell>{fmtTime(e.clockIn)}</TableCell>
                    <TableCell>{fmtTime(e.clockOut)}</TableCell>
                    <TableCell>{e.hours > 0 ? `${e.hours}h` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.note ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
