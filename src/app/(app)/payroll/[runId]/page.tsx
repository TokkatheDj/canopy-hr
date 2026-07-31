import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { formatMoney } from "@/lib/history";
import type { StubLines } from "@/lib/payroll/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RunActions } from "../payroll-client";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Pay Run" };

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  APPROVED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

export default async function PayRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const user = await currentUser();
  if (!user || !can(user, "payroll.manage")) redirect("/home");

  const run = await db.payrollRun.findUnique({
    where: { id: runId },
    include: {
      stubs: {
        include: { employee: true },
        orderBy: { employee: { lastName: "asc" } },
      },
    },
  });
  if (!run) notFound();

  const totals = run.stubs.reduce(
    (acc, s) => {
      const lines = s.lines as unknown as StubLines;
      acc.gross += s.grossCents;
      acc.taxes += lines.taxCents;
      acc.deductions += lines.preTaxDeductionCents;
      acc.net += s.netCents;
      return acc;
    },
    { gross: 0, taxes: 0, deductions: 0, net: 0 },
  );

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={<Link href="/payroll" aria-label="Back to payroll" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Pay run: {fmt(run.periodStart)} – {fmt(run.periodEnd)}
            </h1>
            <p className="text-sm text-muted-foreground">
              Pay date {fmt(run.payDate)} ·{" "}
              <Badge className={STATUS_STYLE[run.status]}>{run.status.toLowerCase()}</Badge>
            </p>
          </div>
        </div>
        <RunActions runId={run.id} status={run.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Total gross", totals.gross],
          ["Pre-tax deductions", totals.deductions],
          ["Taxes withheld", totals.taxes],
          ["Total net pay", totals.net],
        ].map(([label, cents]) => (
          <Card key={label as string}>
            <CardContent className="pt-2">
              <div className="text-xl font-bold">{formatMoney(cents as number)}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee breakdown ({run.stubs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Taxes</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.stubs.map((s) => {
                const lines = s.lines as unknown as StubLines;
                const isHourly = lines.earnings.some((e) => e.hours !== undefined);
                const hours = lines.earnings.reduce((a, e) => a + (e.hours ?? 0), 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/payroll/stubs/${s.id}`}
                        className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {s.employee.firstName} {s.employee.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {isHourly ? "Hourly" : "Salary"}
                    </TableCell>
                    <TableCell className="text-right">
                      {isHourly ? `${Math.round(hours * 100) / 100}h` : "—"}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(s.grossCents)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatMoney(lines.preTaxDeductionCents)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatMoney(lines.taxCents)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(s.netCents)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
