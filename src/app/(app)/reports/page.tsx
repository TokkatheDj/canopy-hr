import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { currentAsOf, formatMoney } from "@/lib/history";
import { sumLedger } from "@/lib/timeoff/accrual";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChartCard, LineChartCard } from "./reports-charts";
import { Wrench } from "lucide-react";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await currentUser();
  if (!user || !can(user, "reports.view")) redirect("/home");
  const isAdmin = user.role === "ADMIN";

  const employees = await db.employee.findMany({
    include: {
      department: true,
      compensations: true,
      policyAssignments: { include: { policy: true } },
      ledgerEntries: true,
    },
  });

  // Headcount by department (current, non-offboarded)
  const current = employees.filter((e) => e.status !== "OFFBOARDED");
  const deptCounts = new Map<string, number>();
  for (const e of current) {
    const d = e.department?.name ?? "—";
    deptCounts.set(d, (deptCounts.get(d) ?? 0) + 1);
  }
  const headcountByDept = [...deptCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, value: count }));

  // Headcount trend: last 12 months (active = hired before month end, not ended)
  const now = new Date();
  const trend: Array<{ name: string; value: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i + 1, 0));
    const count = employees.filter(
      (e) =>
        e.hireDate <= monthEnd && (!e.endDate || e.endDate > monthEnd),
    ).length;
    trend.push({
      name: monthEnd.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      value: count,
    });
  }

  // Turnover: offboarded per quarter (last 6 quarters)
  const turnover: Array<{ name: string; value: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const qEnd = new Date(
      Date.UTC(now.getFullYear(), now.getMonth() - i * 3 + 1, 0),
    );
    const qStart = new Date(Date.UTC(qEnd.getUTCFullYear(), qEnd.getUTCMonth() - 2, 1));
    const count = employees.filter(
      (e) => e.endDate && e.endDate >= qStart && e.endDate <= qEnd,
    ).length;
    turnover.push({
      name: `${qStart.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}–${qEnd.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}`,
      value: count,
    });
  }

  // Payroll trend from runs
  const runs = await db.payrollRun.findMany({
    include: { stubs: { select: { grossCents: true, netCents: true } } },
    orderBy: { periodStart: "asc" },
    take: 12,
  });
  const payrollTrend = runs.map((r) => ({
    name: r.payDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    value: Math.round(r.stubs.reduce((a, s) => a + s.grossCents, 0) / 100),
  }));

  // Time-off liability: outstanding vacation hours × hourly-equivalent rate
  let liabilityHours = 0;
  let liabilityCents = 0;
  for (const e of current) {
    const vacationPolicy = e.policyAssignments.find((p) => p.policy.type === "VACATION");
    if (!vacationPolicy) continue;
    const entries = e.ledgerEntries.filter((l) => l.policyId === vacationPolicy.policyId);
    const hours = sumLedger(entries);
    if (hours <= 0) continue;
    const comp = currentAsOf(e.compensations);
    if (!comp) continue;
    const hourlyRate =
      comp.payType === "HOURLY" ? comp.amountCents : Math.round(comp.amountCents / 2080);
    liabilityHours += hours;
    liabilityCents += Math.round(hours * hourlyRate);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Standard people analytics, plus a custom report builder.
          </p>
        </div>
        <Button
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
          nativeButton={false}
          render={<Link href="/reports/builder" />}
        >
          <Wrench className="size-4" /> Custom report builder
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">{current.length}</div>
            <div className="text-sm text-muted-foreground">Current headcount</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">
              {Math.round(liabilityHours).toLocaleString()}h
            </div>
            <div className="text-sm text-muted-foreground">
              Outstanding vacation hours
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">
              {isAdmin ? formatMoney(liabilityCents) : "—"}
            </div>
            <div className="text-sm text-muted-foreground">
              Est. time-off liability{!isAdmin && " (admin only)"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChartCard title="Headcount by department" data={headcountByDept} />
        <LineChartCard title="Headcount trend (12 months)" data={trend} />
        <BarChartCard title="Turnover by quarter" data={turnover} color="#f59e0b" />
        {isAdmin && payrollTrend.length > 0 && (
          <LineChartCard
            title="Payroll gross per run ($)"
            data={payrollTrend}
            color="#0ea5e9"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Department summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Headcount</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {headcountByDept.map((d) => (
                <TableRow key={d.name}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell className="text-right">{d.value}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {Math.round((d.value / Math.max(current.length, 1)) * 100)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
