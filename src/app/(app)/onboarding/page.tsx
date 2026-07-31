import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TaskCheckbox, StartOffboardingDialog } from "./onboarding-client";

export const metadata = { title: "Onboarding" };

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user || !can(user, "onboarding.manage")) redirect("/home");

  const checklists = await db.checklistInstance.findMany({
    include: {
      employee: true,
      tasks: { orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const activeEmployees = await db.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { lastName: "asc" },
  });

  const inFlight = checklists.filter((c) =>
    c.tasks.some((t) => !t.completedAt),
  );
  const completed = checklists.filter(
    (c) => c.tasks.length > 0 && c.tasks.every((t) => t.completedAt),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Onboarding &amp; Offboarding
          </h1>
          <p className="text-sm text-muted-foreground">
            Checklists for people joining and leaving.
          </p>
        </div>
        <StartOffboardingDialog
          employees={activeEmployees.map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName}`,
          }))}
        />
      </div>

      {inFlight.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No checklists in flight — hire a candidate or start an offboarding.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {inFlight.map((c) => {
          const done = c.tasks.filter((t) => t.completedAt).length;
          const pct = c.tasks.length ? Math.round((done / c.tasks.length) * 100) : 0;
          return (
            <Card key={c.id}>
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Avatar className="size-7">
                      <AvatarImage src={c.employee.photoUrl ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">
                        {c.employee.firstName[0]}
                        {c.employee.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <Link
                      href={`/people/${c.employee.id}`}
                      className="hover:underline"
                    >
                      {c.employee.firstName} {c.employee.lastName}
                    </Link>
                  </CardTitle>
                  <Badge
                    className={
                      c.kind === "ONBOARDING"
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200"
                        : "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                    }
                  >
                    {c.kind.toLowerCase()}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Progress value={pct} className="h-2" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {done}/{c.tasks.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {c.tasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-sm">
                      <TaskCheckbox taskId={t.id} checked={Boolean(t.completedAt)} />
                      <div className={t.completedAt ? "text-muted-foreground line-through" : ""}>
                        {t.title}
                        <span className="ml-2 text-xs text-muted-foreground no-underline">
                          {t.assigneeRole} · due {fmtDate(t.dueDate)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {completed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently completed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {completed.slice(0, 8).map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <Link href={`/people/${c.employee.id}`} className="hover:underline">
                  {c.employee.firstName} {c.employee.lastName}
                </Link>
                <span className="text-muted-foreground">
                  {c.kind.toLowerCase()} · {c.tasks.length} tasks
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
