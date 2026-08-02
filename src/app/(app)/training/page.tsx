import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
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
import { MarkCompleteButton } from "./training-client";

export const metadata = { title: "Training" };

type Status = "complete" | "overdue" | "expired" | "not started";

const STATUS_STYLE: Record<Status, string> = {
  complete: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "not started": "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

function fmt(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function addMonthsUTC(d: Date, months: number): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
    ),
  );
}

type CourseRules = {
  required: boolean;
  frequencyMonths: number | null;
  dueDaysFromHire: number | null;
};

function courseStatus(
  course: CourseRules,
  hireDate: Date,
  latest: Date | null,
  now: Date,
): { status: Status; completedAt: Date | null; dueDate: Date | null } {
  if (!latest) {
    if (course.required && course.dueDaysFromHire != null) {
      const due = new Date(hireDate.getTime() + course.dueDaysFromHire * 86400000);
      return { status: now > due ? "overdue" : "not started", completedAt: null, dueDate: due };
    }
    return { status: "not started", completedAt: null, dueDate: null };
  }
  if (course.frequencyMonths != null) {
    const next = addMonthsUTC(latest, course.frequencyMonths);
    return {
      status: now > next ? "expired" : "complete",
      completedAt: latest,
      dueDate: next,
    };
  }
  return { status: "complete", completedAt: latest, dueDate: null };
}

function statusInfo(s: { status: Status; completedAt: Date | null; dueDate: Date | null }): string {
  switch (s.status) {
    case "complete":
      return s.dueDate
        ? `Completed ${fmt(s.completedAt!)} · renews ${fmt(s.dueDate)}`
        : `Completed ${fmt(s.completedAt!)}`;
    case "expired":
      return `Expired ${fmt(s.dueDate!)}`;
    case "overdue":
      return `Due ${fmt(s.dueDate!)}`;
    case "not started":
      return s.dueDate ? `Due ${fmt(s.dueDate)}` : "—";
  }
}

export default async function TrainingPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const isAdmin = user.role === "ADMIN";

  const courses = await db.trainingCourse.findMany({ include: { category: true } });
  courses.sort(
    (a, b) =>
      (a.category?.order ?? Number.MAX_SAFE_INTEGER) -
        (b.category?.order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
  );

  const me = user.employeeId
    ? await db.employee.findUnique({
        where: { id: user.employeeId },
        select: {
          hireDate: true,
          trainingRecords: { select: { courseId: true, completedAt: true } },
        },
      })
    : null;

  const latestFor = (
    records: Array<{ courseId: string; completedAt: Date }>,
    courseId: string,
  ): Date | null => {
    let latest: Date | null = null;
    for (const r of records) {
      if (r.courseId === courseId && (!latest || r.completedAt > latest)) latest = r.completedAt;
    }
    return latest;
  };

  const myRows = me
    ? courses.map((c) => ({
        course: c,
        result: courseStatus(c, me.hireDate, latestFor(me.trainingRecords, c.id), now),
      }))
    : [];

  let compliance: Array<{
    course: (typeof courses)[number];
    complete: number;
    outstanding: number;
  }> = [];
  if (isAdmin) {
    const employees = await db.employee.findMany({
      where: { status: "ACTIVE" },
      select: {
        hireDate: true,
        trainingRecords: { select: { courseId: true, completedAt: true } },
      },
    });
    compliance = courses
      .map((c) => {
        let complete = 0;
        for (const emp of employees) {
          const { status } = courseStatus(c, emp.hireDate, latestFor(emp.trainingRecords, c.id), now);
          if (status === "complete") complete++;
        }
        return { course: c, complete, outstanding: employees.length - complete };
      })
      .sort((a, b) => b.outstanding - a.outstanding);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Training</h1>
        <p className="text-sm text-muted-foreground">
          Compliance courses and completion status.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My trainings</CardTitle>
        </CardHeader>
        <CardContent>
          {!me ? (
            <p className="text-sm text-muted-foreground">
              Your account isn&apos;t linked to an employee record, so there are no
              trainings to show.
            </p>
          ) : myRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No courses have been set up yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed / Due</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRows.map(({ course, result }) => (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium">{course.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {course.category?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {course.required ? (
                        <Badge variant="outline">required</Badge>
                      ) : (
                        <span className="text-muted-foreground">optional</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLE[result.status]}>{result.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {statusInfo(result)}
                    </TableCell>
                    <TableCell className="text-right">
                      {result.status !== "complete" && (
                        <MarkCompleteButton courseId={course.id} courseName={course.name} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Company compliance</CardTitle>
          </CardHeader>
          <CardContent>
            {compliance.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No courses have been set up yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead className="text-right">Complete</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compliance.map(({ course, complete, outstanding }) => (
                    <TableRow key={course.id}>
                      <TableCell className="font-medium">{course.name}</TableCell>
                      <TableCell>
                        {course.required ? (
                          <Badge variant="outline">required</Badge>
                        ) : (
                          <span className="text-muted-foreground">optional</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {course.frequencyMonths == null
                          ? "One-time"
                          : `Every ${course.frequencyMonths} months`}
                      </TableCell>
                      <TableCell className="text-right">{complete}</TableCell>
                      <TableCell
                        className={`text-right ${
                          outstanding > 0
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {outstanding}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
