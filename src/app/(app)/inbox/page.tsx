import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, MarkAllReadButton } from "./inbox-actions";
import type { ApprovalStep, InfoChangePayload } from "@/lib/approvals";

export const metadata = { title: "Inbox" };

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TYPE_LABEL: Record<string, string> = {
  TIME_OFF: "Time off",
  INFO_CHANGE: "Info change",
  TIMESHEET: "Timesheet",
  OFFER: "Offer",
};

export default async function InboxPage() {
  const user = await currentUser();
  if (!user) return null;

  // Approvals where the CURRENT pending step belongs to me (admins see all pending)
  const allPending = await db.approvalRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  const mine = allPending.filter((a) => {
    const steps = a.steps as unknown as ApprovalStep[];
    const current = steps.find((s) => s.status === "PENDING");
    if (!current) return false;
    return user.role === "ADMIN" || current.approverId === user.employeeId;
  });

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Approvals waiting on you, and your notifications.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Needs your approval{" "}
            {mine.length > 0 && (
              <Badge className="ml-1 bg-emerald-700 text-white">{mine.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing waiting on you. 🎉
            </p>
          ) : (
            mine.map((a) => {
              const steps = a.steps as unknown as ApprovalStep[];
              const payload =
                a.type === "INFO_CHANGE"
                  ? (a.payload as unknown as InfoChangePayload)
                  : null;
              return (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Badge variant="outline" className="mr-2">
                        {TYPE_LABEL[a.type] ?? a.type}
                      </Badge>
                      <span className="font-medium">{a.requesterName}</span>
                      <span className="text-muted-foreground"> · {a.summary}</span>
                    </div>
                    <ApprovalActions approvalId={a.id} />
                  </div>
                  {payload && (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {payload.changes.map((c) => (
                        <li key={c.field}>
                          <span className="font-medium text-foreground">
                            {c.label}:
                          </span>{" "}
                          <span className="line-through">{c.oldValue || "—"}</span>{" "}
                          → {c.newValue || "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    Requested {fmtDateTime(a.createdAt)} · step{" "}
                    {steps.findIndex((s) => s.status === "PENDING") + 1} of{" "}
                    {steps.length}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Notifications</CardTitle>
          {unread > 0 && <MarkAllReadButton />}
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  {!n.readAt && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500" />
                  )}
                  <div className={n.readAt ? "text-muted-foreground" : ""}>
                    <span className="font-medium">{n.title}</span>
                    {n.body && <span> — {n.body}</span>}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {fmtDateTime(n.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
