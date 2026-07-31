import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { formatMoney } from "@/lib/history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateRunButton } from "./payroll-client";

export const metadata = { title: "Payroll" };

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  APPROVED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

function fmtRange(s: Date, e: Date): string {
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${f(s)} – ${f(e)}`;
}

export default async function PayrollPage() {
  const user = await currentUser();
  if (!user || !can(user, "payroll.manage")) redirect("/home");

  const runs = await db.payrollRun.findMany({
    include: { stubs: { select: { grossCents: true, netCents: true } } },
    orderBy: { periodStart: "desc" },
    take: 24,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Simulated payroll — plausible math, no real money movement.
          </p>
        </div>
        <CreateRunButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pay runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pay runs yet — start one for the current period.
            </p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => {
                const gross = r.stubs.reduce((a, s) => a + s.grossCents, 0);
                const net = r.stubs.reduce((a, s) => a + s.netCents, 0);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/payroll/${r.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition hover:border-emerald-500"
                    >
                      <span className="font-medium">
                        {fmtRange(r.periodStart, r.periodEnd)}
                      </span>
                      <span className="flex items-center gap-4">
                        <span className="text-muted-foreground">
                          {r.stubs.length} employees
                        </span>
                        <span className="text-muted-foreground">
                          gross {formatMoney(gross)}
                        </span>
                        <span className="text-muted-foreground">
                          net {formatMoney(net)}
                        </span>
                        <Badge className={STATUS_STYLE[r.status]}>
                          {r.status.toLowerCase()}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
