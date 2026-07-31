import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { balancesFor } from "@/lib/timeoff/materialize";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Cake,
  PartyPopper,
  Megaphone,
  Palmtree,
  Inbox as InboxIcon,
  ExternalLink,
  CalendarDays,
} from "lucide-react";
import type { ApprovalStep } from "@/lib/approvals";
import { AnnounceDialog } from "./announce-dialog";

export const metadata = { title: "Home" };

function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

export default async function HomePage() {
  const user = await currentUser();
  if (!user) return null;

  const today = utcToday();
  const thisMonth = today.getUTCMonth();

  const [announcements, links, activeEmployees, outToday, holidaysUpcoming] =
    await Promise.all([
      db.announcement.findMany({
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 4,
      }),
      db.companyLink.findMany({ orderBy: { order: "asc" } }),
      db.employee.findMany({
        where: { status: { not: "OFFBOARDED" } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          birthDate: true,
          hireDate: true,
        },
      }),
      db.timeOffRequest.findMany({
        where: {
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today },
        },
        include: { employee: true, policy: true },
      }),
      db.holiday.findMany({
        where: {
          date: {
            gte: today,
            lte: new Date(today.getTime() + 45 * 24 * 3600 * 1000),
          },
        },
        orderBy: { date: "asc" },
        take: 2,
      }),
    ]);

  // Celebrations: birthdays within a rolling window (yesterday .. +7 days),
  // measured against the birthday's NEXT occurrence so month boundaries work.
  const DAY_MS = 24 * 3600 * 1000;
  const birthdays = activeEmployees
    .map((e) => {
      if (!e.birthDate) return null;
      const next = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          e.birthDate.getUTCMonth(),
          e.birthDate.getUTCDate(),
        ),
      );
      if (next.getTime() < today.getTime() - DAY_MS) {
        next.setUTCFullYear(next.getUTCFullYear() + 1);
      }
      const delta = (next.getTime() - today.getTime()) / DAY_MS;
      return delta >= -1 && delta <= 7 ? { ...e, nextBirthday: next } : null;
    })
    .filter((e) => e !== null);
  const anniversaries = activeEmployees
    .filter(
      (e) =>
        e.hireDate.getUTCMonth() === thisMonth &&
        e.hireDate.getUTCFullYear() < today.getUTCFullYear(),
    )
    .map((e) => ({
      ...e,
      years: today.getUTCFullYear() - e.hireDate.getUTCFullYear(),
    }))
    .sort((a, b) => b.years - a.years)
    .slice(0, 5);

  // Approvals waiting on me
  const allPending = await db.approvalRequest.findMany({
    where: { status: "PENDING" },
  });
  const waitingOnMe = allPending.filter((a) => {
    const steps = a.steps as unknown as ApprovalStep[];
    const current = steps.find((s) => s.status === "PENDING");
    if (!current) return false;
    return user.role === "ADMIN" || current.approverId === user.employeeId;
  });

  const balances = user.employeeId ? await balancesFor(user.employeeId) : [];

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening at Meridian Coffee Co. today.
          </p>
        </div>
        {user.role === "ADMIN" && <AnnounceDialog />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column (2/3) */}
        <div className="space-y-4 lg:col-span-2">
          {waitingOnMe.length > 0 && (
            <Card className="border-emerald-300 dark:border-emerald-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <InboxIcon className="size-4 text-emerald-600" />
                  Waiting on you
                </CardTitle>
                <Link
                  href="/inbox"
                  className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Open inbox →
                </Link>
              </CardHeader>
              <CardContent className="space-y-2">
                {waitingOnMe.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{a.requesterName}</span>{" "}
                      <span className="text-muted-foreground">· {a.summary}</span>
                    </span>
                    <Badge variant="outline">{a.type.replace("_", " ").toLowerCase()}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="size-4 text-emerald-600" /> Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.title}</span>
                    {a.pinned && (
                      <Badge variant="outline" className="text-[10px]">
                        pinned
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.authorName} · {fmtDate(a.createdAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palmtree className="size-4 text-emerald-600" /> Who&apos;s out today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {outToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Everyone&apos;s in today.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {outToday.map((r) => (
                    <Link
                      key={r.id}
                      href={`/people/${r.employee.id}`}
                      className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:border-emerald-500"
                    >
                      <Avatar className="size-6">
                        <AvatarImage src={r.employee.photoUrl ?? undefined} alt="" />
                        <AvatarFallback className="text-[10px]">
                          {r.employee.firstName[0]}
                          {r.employee.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      {r.employee.firstName} {r.employee.lastName}
                      <span className="text-xs text-muted-foreground">
                        until {fmtDate(r.endDate)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {balances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">My time off</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {balances.map((b) => (
                  <div key={b.policyId} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{b.policyName}</span>
                    <span className="font-medium">{b.balanceHours}h</span>
                  </div>
                ))}
                <Link
                  href="/time-off"
                  className="block pt-1 text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Request time off →
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PartyPopper className="size-4 text-emerald-600" /> Celebrations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {birthdays.length === 0 && anniversaries.length === 0 && (
                <p className="text-muted-foreground">Nothing this week.</p>
              )}
              {birthdays.map((e) => (
                <div key={`b-${e.id}`} className="flex items-center gap-2">
                  <Cake className="size-4 text-pink-500" />
                  <Link href={`/people/${e.id}`} className="hover:underline">
                    {e.firstName} {e.lastName}
                  </Link>
                  <span className="text-muted-foreground">
                    {e.birthDate && fmtDate(e.birthDate)}
                  </span>
                </div>
              ))}
              {anniversaries.map((e) => (
                <div key={`a-${e.id}`} className="flex items-center gap-2">
                  <PartyPopper className="size-4 text-amber-500" />
                  <Link href={`/people/${e.id}`} className="hover:underline">
                    {e.firstName} {e.lastName}
                  </Link>
                  <span className="text-muted-foreground">
                    {e.years} {e.years === 1 ? "year" : "years"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {holidaysUpcoming.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4 text-emerald-600" /> Upcoming holidays
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {holidaysUpcoming.map((h) => (
                  <div key={h.id} className="flex justify-between">
                    <span>{h.name}</span>
                    <span className="text-muted-foreground">{fmtDate(h.date)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  className="flex items-center gap-1.5 text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  <ExternalLink className="size-3.5" /> {l.label}
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
