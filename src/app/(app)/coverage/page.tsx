import { format } from "date-fns";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { CoverageClient } from "./coverage-client";

export const metadata = { title: "Coverage" };

const name = (e: { firstName: string; lastName: string }) =>
  `${e.firstName} ${e.lastName}`;

export default async function CoveragePage() {
  const user = await currentUser();
  const meId = user?.employeeId ?? null;
  const canManage = user ? can(user, "coverage.manage") : false;

  const requests = await db.coverageRequest.findMany({
    where: canManage
      ? {}
      : { recipients: { some: { employeeId: meId ?? "__none__" } } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      location: { select: { name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      absent: { select: { firstName: true, lastName: true } },
      filledBy: { select: { firstName: true, lastName: true } },
      recipients: {
        orderBy: { sentAt: "asc" },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  let employees: {
    id: string;
    name: string;
    department: string | null;
    locationId: string | null;
    location: string | null;
  }[] = [];
  let locations: { id: string; name: string }[] = [];
  let timeOff: { employeeId: string; start: string; end: string }[] = [];

  if (canManage) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 60);
    const [emps, locs, offs] = await Promise.all([
      db.employee.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          location: { select: { id: true, name: true } },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      db.location.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.timeOffRequest.findMany({
        where: {
          status: "APPROVED",
          endDate: { gte: today },
          startDate: { lte: horizon },
        },
        select: { employeeId: true, startDate: true, endDate: true },
      }),
    ]);
    employees = emps.map((e) => ({
      id: e.id,
      name: name(e),
      department: e.department?.name ?? null,
      locationId: e.location?.id ?? null,
      location: e.location?.name ?? null,
    }));
    locations = locs;
    timeOff = offs.map((o) => ({
      employeeId: o.employeeId,
      start: format(o.startDate, "yyyy-MM-dd"),
      end: format(o.endDate, "yyyy-MM-dd"),
    }));
  }

  return (
    <CoverageClient
      meId={meId}
      canManage={canManage}
      requests={requests.map((r) => ({
        id: r.id,
        date: format(r.date, "yyyy-MM-dd"),
        dateLabel: format(r.date, "EEE, MMM d"),
        startTime: r.startTime,
        endTime: r.endTime,
        location: r.location?.name ?? null,
        role: r.role,
        notes: r.notes,
        status: r.status,
        emailSubject: r.emailSubject,
        emailBody: r.emailBody,
        createdByName: name(r.createdBy),
        absentName: r.absent ? name(r.absent) : null,
        filledByName: r.filledBy ? name(r.filledBy) : null,
        createdAt: r.createdAt.toISOString(),
        recipients: r.recipients.map((rec) => ({
          employeeId: rec.employeeId,
          name: name(rec.employee),
          response: rec.response,
        })),
      }))}
      employees={employees}
      locations={locations}
      timeOff={timeOff}
    />
  );
}
