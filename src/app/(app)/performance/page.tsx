import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  NewGoalDialog,
  GoalCheckinDialog,
  PeerFeedbackDialog,
  NewOneOnOneDialog,
  NewCycleDialog,
  CloseCycleButton,
} from "./performance-client";
import { Target, ClipboardList, MessagesSquare, CalendarClock } from "lucide-react";

export const metadata = { title: "Performance" };

const GOAL_STATUS_STYLE: Record<string, string> = {
  ON_TRACK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  AT_RISK: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  BEHIND: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  COMPLETED: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
};

const KIND_LABEL: Record<string, string> = {
  SELF: "Self review",
  MANAGER: "Manager review",
  PEER: "Peer feedback",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function PerformancePage() {
  const user = await currentUser();
  if (!user?.employeeId) {
    return <p className="text-muted-foreground">No employee record linked.</p>;
  }
  const isAdmin = can(user, "performance.manage");

  const [cycles, myAssessments, myGoals, reportGoals, oneOnOnes, colleagues] =
    await Promise.all([
      db.reviewCycle.findMany({
        include: { assessments: { select: { status: true } } },
        orderBy: { startDate: "desc" },
      }),
      db.assessment.findMany({
        where: { authorId: user.employeeId, cycle: { status: "OPEN" } },
        include: { subject: true, cycle: true },
        orderBy: { kind: "asc" },
      }),
      db.goal.findMany({
        where: { employeeId: user.employeeId },
        include: { checkins: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
      }),
      db.goal.findMany({
        where: { employee: { managerId: user.employeeId } },
        include: { employee: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.oneOnOne.findMany({
        where: {
          OR: [
            { participantAId: user.employeeId },
            { participantBId: user.employeeId },
          ],
        },
        include: { participantA: true, participantB: true },
        orderBy: { date: "desc" },
        take: 6,
      }),
      db.employee.findMany({
        where: { status: "ACTIVE", id: { not: user.employeeId } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { lastName: "asc" },
      }),
    ]);

  const openCycle = cycles.find((c) => c.status === "OPEN");
  const todo = myAssessments.filter((a) => a.status !== "SUBMITTED");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
          <p className="text-sm text-muted-foreground">
            Reviews, goals, peer feedback, and 1:1s.
          </p>
        </div>
        <div className="flex gap-2">
          {openCycle && (
            <PeerFeedbackDialog
              cycleId={openCycle.id}
              colleagues={colleagues.map((c) => ({
                id: c.id,
                name: `${c.firstName} ${c.lastName}`,
              }))}
            />
          )}
          {isAdmin && !openCycle && <NewCycleDialog />}
        </div>
      </div>

      {/* Reviews to write */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4 text-emerald-600" />
            {openCycle ? `${openCycle.name} — your reviews` : "Reviews"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!openCycle ? (
            <p className="text-sm text-muted-foreground">
              No review cycle is open right now.
            </p>
          ) : todo.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All caught up — every review you owe is submitted. 🎉
            </p>
          ) : (
            <ul className="space-y-2">
              {todo.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/performance/assessments/${a.id}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition hover:border-emerald-500"
                  >
                    <span>
                      <span className="font-medium">{KIND_LABEL[a.kind]}</span>
                      {a.kind !== "SELF" && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {a.subject.firstName} {a.subject.lastName}
                        </span>
                      )}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        a.status === "IN_PROGRESS" ? "text-amber-600" : undefined
                      }
                    >
                      {a.status === "IN_PROGRESS" ? "in progress" : "not started"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Goals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-emerald-600" /> My goals
            </CardTitle>
            <NewGoalDialog />
          </CardHeader>
          <CardContent className="space-y-3">
            {myGoals.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No goals yet — set one to track your growth.
              </p>
            )}
            {myGoals.map((g) => (
              <div key={g.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{g.title}</span>
                  <Badge className={GOAL_STATUS_STYLE[g.status]}>
                    {g.status.replace("_", " ").toLowerCase()}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={g.progressPct} className="h-2" />
                  <span className="text-xs text-muted-foreground">{g.progressPct}%</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {g.checkins[0]
                      ? `Last check-in: ${g.checkins[0].body.slice(0, 60)}`
                      : g.dueDate
                        ? `Due ${fmtDate(g.dueDate)}`
                        : ""}
                  </span>
                  <GoalCheckinDialog
                    goalId={g.id}
                    currentPct={g.progressPct}
                    currentStatus={g.status}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Team goals for managers */}
          {reportGoals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Team goals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {reportGoals.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/people/${g.employee.id}`}
                        className="font-medium hover:underline"
                      >
                        {g.employee.firstName}
                      </Link>
                      <span className="text-muted-foreground"> · {g.title}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {g.progressPct}%
                      </span>
                      <Badge className={GOAL_STATUS_STYLE[g.status]}>
                        {g.status.replace("_", " ").toLowerCase()}
                      </Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 1:1s */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessagesSquare className="size-4 text-emerald-600" /> 1:1s
              </CardTitle>
              <NewOneOnOneDialog
                colleagues={colleagues.map((c) => ({
                  id: c.id,
                  name: `${c.firstName} ${c.lastName}`,
                }))}
              />
            </CardHeader>
            <CardContent className="space-y-2">
              {oneOnOnes.length === 0 && (
                <p className="text-sm text-muted-foreground">No 1:1s logged yet.</p>
              )}
              {oneOnOnes.map((o) => {
                const other =
                  o.participantAId === user.employeeId ? o.participantB : o.participantA;
                return (
                  <div key={o.id} className="rounded-lg border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        with {other.firstName} {other.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(o.date)}
                      </span>
                    </div>
                    {o.sharedNotes && (
                      <p className="mt-1 text-muted-foreground">{o.sharedNotes}</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Admin: cycles */}
      {isAdmin && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-emerald-600" /> Review cycles
            </CardTitle>
            {!openCycle && <NewCycleDialog />}
          </CardHeader>
          <CardContent className="space-y-2">
            {cycles.map((c) => {
              const submitted = c.assessments.filter((a) => a.status === "SUBMITTED").length;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {submitted}/{c.assessments.length} submitted
                    </span>
                    <Badge
                      variant={c.status === "OPEN" ? "default" : "outline"}
                      className={
                        c.status === "OPEN" ? "bg-emerald-600 text-white" : undefined
                      }
                    >
                      {c.status.toLowerCase()}
                    </Badge>
                    {c.status === "OPEN" && <CloseCycleButton cycleId={c.id} />}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
