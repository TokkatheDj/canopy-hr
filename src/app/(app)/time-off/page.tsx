import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { balancesFor } from "@/lib/timeoff/materialize";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RequestTimeOffDialog, CancelRequestButton } from "./timeoff-client";
import { TeamCalendar } from "./team-calendar";
import { Palmtree, Stethoscope, Sparkles } from "lucide-react";

export const metadata = { title: "Time Off" };

const POLICY_ICON: Record<string, React.ReactNode> = {
  VACATION: <Palmtree className="size-5" />,
  SICK: <Stethoscope className="size-5" />,
  PERSONAL: <Sparkles className="size-5" />,
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  DENIED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  CANCELED: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

function fmtRange(start: Date, end: Date): string {
  const f = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return f(start) === f(end) ? f(start) : `${f(start)} – ${f(end)}`;
}

export default async function TimeOffPage() {
  const user = await currentUser();
  if (!user?.employeeId) {
    return <p className="text-muted-foreground">No employee record linked.</p>;
  }

  const balances = await balancesFor(user.employeeId);
  const myRequests = await db.timeOffRequest.findMany({
    where: { employeeId: user.employeeId },
    include: { policy: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  // Calendar data: approved time off for everyone (current + next month)
  const today = new Date();
  const windowStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
  const windowEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth() + 2, 0));
  const approved = await db.timeOffRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: windowEnd },
      endDate: { gte: windowStart },
    },
    include: { employee: true, policy: true },
  });
  const holidays = await db.holiday.findMany({
    where: { date: { gte: windowStart, lte: windowEnd } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Time Off</h1>
          <p className="text-sm text-muted-foreground">
            Your balances, requests, and the team calendar.
          </p>
        </div>
        <RequestTimeOffDialog
          policies={balances.map((b) => ({
            id: b.policyId,
            name: b.policyName,
            balance: b.balanceHours,
          }))}
        />
      </div>

      {/* Balances */}
      <div className="grid gap-4 sm:grid-cols-3">
        {balances.map((b) => (
          <Card key={b.policyId}>
            <CardContent className="flex items-center gap-4 pt-2">
              <div className="rounded-full bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                {POLICY_ICON[b.type] ?? <Palmtree className="size-5" />}
              </div>
              <div>
                <div className="text-2xl font-bold leading-tight">
                  {b.balanceHours}
                  <span className="text-sm font-normal text-muted-foreground"> hrs</span>
                </div>
                <div className="text-sm text-muted-foreground">{b.policyName}</div>
                <div className="text-xs text-muted-foreground">
                  {b.accrualMethod === "PER_PAY_PERIOD"
                    ? `accrues ${b.accrualHours}h per pay period`
                    : `${b.accrualHours}h granted each year`}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* My requests */}
      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent>
          {myRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t requested any time off yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {myRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{r.policy.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {fmtRange(r.startDate, r.endDate)} · {r.totalHours}h
                    </span>
                    {r.reason && (
                      <span className="text-muted-foreground"> · “{r.reason}”</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_STYLE[r.status]}>
                      {r.status.toLowerCase()}
                    </Badge>
                    {r.status === "PENDING" && <CancelRequestButton requestId={r.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Team calendar */}
      <Card>
        <CardHeader>
          <CardTitle>Who&apos;s out</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamCalendar
            events={approved.map((r) => ({
              id: r.id,
              name: `${r.employee.firstName} ${r.employee.lastName}`,
              type: r.policy.type,
              start: r.startDate.toISOString().slice(0, 10),
              end: r.endDate.toISOString().slice(0, 10),
            }))}
            holidays={holidays.map((h) => ({
              name: h.name,
              date: h.date.toISOString().slice(0, 10),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
