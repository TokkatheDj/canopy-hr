"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  UserX,
  X,
} from "lucide-react";
import {
  assignCoverage,
  cancelCoverage,
  createCoverageBlast,
  respondToCoverage,
} from "@/actions/coverage";

type Recipient = {
  employeeId: string;
  name: string;
  response: "AVAILABLE" | "DECLINED" | null;
};

type CoverageItem = {
  id: string;
  date: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  location: string | null;
  role: string | null;
  notes: string | null;
  status: "OPEN" | "FILLED" | "CANCELLED";
  emailSubject: string;
  emailBody: string;
  createdByName: string;
  absentName: string | null;
  filledByName: string | null;
  createdAt: string;
  recipients: Recipient[];
};

type EmployeeOption = {
  id: string;
  name: string;
  department: string | null;
  locationId: string | null;
  location: string | null;
};

type Props = {
  meId: string | null;
  canManage: boolean;
  requests: CoverageItem[];
  employees: EmployeeOption[];
  locations: { id: string; name: string }[];
  timeOff: { employeeId: string; start: string; end: string }[];
};

const STATUS_BADGE: Record<CoverageItem["status"], { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  FILLED: { label: "Filled", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  CANCELLED: { label: "Cancelled", cls: "text-muted-foreground" },
};

export function CoverageClient({
  meId,
  canManage,
  requests,
  employees,
  locations,
  timeOff,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shift Coverage</h1>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Someone called off? Blast an email to eligible teammates and fill the shift fast."
              : "Open shifts your managers asked you about — reply if you can help."}
          </p>
        </div>
        {canManage && (
          <NewBlastDialog
            employees={employees}
            locations={locations}
            timeOff={timeOff}
          />
        )}
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Megaphone className="mx-auto mb-3 size-8 opacity-40" />
            No coverage requests yet.
            {canManage && " When someone calls off, send your first blast from here."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <RequestCard key={r.id} item={r} meId={meId} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  item,
  meId,
  canManage,
}: {
  item: CoverageItem;
  meId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const mine = meId ? item.recipients.find((r) => r.employeeId === meId) : null;
  const available = item.recipients.filter((r) => r.response === "AVAILABLE");
  const declined = item.recipients.filter((r) => r.response === "DECLINED");
  const badge = STATUS_BADGE[item.status];

  async function act(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "Something went wrong");
  }

  return (
    <Card className={item.status === "CANCELLED" ? "opacity-60" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={badge.cls}>
            {badge.label}
          </Badge>
          <span className="font-semibold">
            {item.role ?? "Shift"} - {item.dateLabel}
          </span>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarClock className="size-3.5" />
            {item.startTime} - {item.endTime}
          </span>
          {item.location && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              {item.location}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {item.absentName && (
            <span className="inline-flex items-center gap-1">
              <UserX className="size-3.5" />
              {item.absentName} called off
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Mail className="size-3.5" />
            Email sent to {item.recipients.length}{" "}
            {item.recipients.length === 1 ? "person" : "people"} by {item.createdByName}
          </span>
          {item.status === "OPEN" && (
            <span>
              {available.length} available - {declined.length} declined
            </span>
          )}
          {item.status === "FILLED" && item.filledByName && (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              Covered by {item.filledByName}
            </span>
          )}
        </div>

        {item.notes && <p className="text-sm">{item.notes}</p>}

        {mine && item.status === "OPEN" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
            {mine.response === null ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">Can you cover this shift?</span>
                <Button
                  size="sm"
                  className="bg-emerald-700 text-white hover:bg-emerald-800"
                  disabled={busy !== null}
                  onClick={() =>
                    act("yes", () =>
                      respondToCoverage({ requestId: item.id, response: "AVAILABLE" }),
                    )
                  }
                >
                  {busy === "yes" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  I can cover it
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    act("no", () =>
                      respondToCoverage({ requestId: item.id, response: "DECLINED" }),
                    )
                  }
                >
                  {busy === "no" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                  Can&apos;t this time
                </Button>
              </div>
            ) : (
              <p className="text-sm">
                {mine.response === "AVAILABLE"
                  ? "You said you can cover this shift - thanks! Your manager will confirm."
                  : "You declined this one."}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <EmailPreviewDialog subject={item.emailSubject} body={item.emailBody} />
          {canManage && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                Responses
              </Button>
              {item.status === "OPEN" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy !== null}
                  onClick={() => act("cancel", () => cancelCoverage(item.id))}
                >
                  {busy === "cancel" && <Loader2 className="size-4 animate-spin" />}
                  Cancel request
                </Button>
              )}
            </>
          )}
        </div>

        {canManage && expanded && (
          <div className="divide-y rounded-md border">
            {item.recipients.map((r) => (
              <div
                key={r.employeeId}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>{r.name}</span>
                <span className="flex items-center gap-2">
                  {r.response === "AVAILABLE" && (
                    <Badge
                      variant="outline"
                      className="border-emerald-300 bg-emerald-50 text-emerald-800"
                    >
                      Available
                    </Badge>
                  )}
                  {r.response === "DECLINED" && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Declined
                    </Badge>
                  )}
                  {r.response === null && (
                    <span className="text-xs text-muted-foreground">No reply</span>
                  )}
                  {item.status === "OPEN" && r.response === "AVAILABLE" && (
                    <Button
                      size="sm"
                      className="h-7 bg-emerald-700 text-white hover:bg-emerald-800"
                      disabled={busy !== null}
                      onClick={() =>
                        act(`assign-${r.employeeId}`, () =>
                          assignCoverage({
                            requestId: item.id,
                            employeeId: r.employeeId,
                          }),
                        )
                      }
                    >
                      {busy === `assign-${r.employeeId}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Assign"
                      )}
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmailPreviewDialog({ subject, body }: { subject: string; body: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Mail className="size-4" /> View email
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Simulated email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Demo app - this email is recorded and delivered as an in-app
            notification instead of real mail.
          </p>
          <div className="rounded-md border p-3">
            <p className="font-semibold">{subject}</p>
          </div>
          <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans">
            {body}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function todayYmd() {
  return format(new Date(), "yyyy-MM-dd");
}

function NewBlastDialog({
  employees,
  locations,
  timeOff,
}: {
  employees: EmployeeOption[];
  locations: { id: string; name: string }[];
  timeOff: { employeeId: string; start: string; end: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(todayYmd);
  const [startTime, setStartTime] = useState("6:00 AM");
  const [endTime, setEndTime] = useState("2:30 PM");
  const [locationId, setLocationId] = useState("");
  const [role, setRole] = useState("");
  const [absentId, setAbsentId] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);

  const offIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of timeOff) {
      if (t.start <= date && date <= t.end) ids.add(t.employeeId);
    }
    return ids;
  }, [timeOff, date]);

  const defaultSelection = useMemo(() => {
    const ids = new Set<string>();
    for (const e of employees) {
      if (e.id === absentId || offIds.has(e.id)) continue;
      if (locationId && e.locationId !== locationId) continue;
      ids.add(e.id);
    }
    return ids;
  }, [employees, absentId, offIds, locationId]);

  const effective = touched ? selected : defaultSelection;

  function toggle(id: string) {
    const next = new Set(effective);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setTouched(true);
  }

  function reset() {
    setDate(todayYmd());
    setStartTime("6:00 AM");
    setEndTime("2:30 PM");
    setLocationId("");
    setRole("");
    setAbsentId("");
    setNotes("");
    setSelected(new Set());
    setTouched(false);
  }

  async function submit() {
    if (effective.size === 0) {
      toast.error("Pick at least one recipient");
      return;
    }
    setBusy(true);
    const res = await createCoverageBlast({
      date,
      startTime,
      endTime,
      locationId: locationId || undefined,
      role: role.trim() || undefined,
      notes: notes.trim() || undefined,
      absentId: absentId || undefined,
      recipientIds: [...effective],
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Coverage blast sent to ${effective.size} people`);
      setOpen(false);
      reset();
      router.refresh();
    } else {
      toast.error(res.error ?? "Something went wrong");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button className="bg-emerald-700 text-white hover:bg-emerald-800">
            <Megaphone className="size-4" /> New coverage blast
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send a coverage blast</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cov-date">Shift date</Label>
              <Input
                id="cov-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setTouched(false);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cov-start">Start</Label>
              <Input
                id="cov-start"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="6:00 AM"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cov-end">End</Label>
              <Input
                id="cov-end"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="2:30 PM"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Location (optional)</Label>
              <Select
                value={locationId}
                items={[
                  { value: "", label: "Any location" },
                  ...locations.map((l) => ({ value: l.id, label: l.name })),
                ]}
                onValueChange={(v) => {
                  setLocationId(String(v ?? ""));
                  setTouched(false);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Any location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any location</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cov-role">Role needed (optional)</Label>
              <Input
                id="cov-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Barista, Day Porter"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Who called off? (optional)</Label>
            <Select
              value={absentId}
              items={[
                { value: "", label: "Not tied to a call-off" },
                ...employees.map((e) => ({ value: e.id, label: e.name })),
              ]}
              onValueChange={(v) => {
                setAbsentId(String(v ?? ""));
                setTouched(false);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Not tied to a call-off" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Not tied to a call-off</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cov-notes">Notes for the email (optional)</Label>
            <Textarea
              id="cov-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Overtime rates apply. Park in the rear lot."
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                Email recipients{" "}
                <span className="text-muted-foreground">({effective.size} selected)</span>
              </Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => {
                    setSelected(new Set(defaultSelection));
                    setTouched(true);
                  }}
                >
                  Select eligible
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => {
                    setSelected(new Set());
                    setTouched(true);
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              People already approved for time off that day start unchecked.
            </p>
            <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border p-2">
              {employees.map((e) => {
                const off = offIds.has(e.id);
                const isAbsent = e.id === absentId;
                return (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={effective.has(e.id)}
                      disabled={isAbsent}
                      onCheckedChange={() => toggle(e.id)}
                    />
                    <span className={isAbsent ? "line-through opacity-50" : undefined}>
                      {e.name}
                    </span>
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {e.department && <span>{e.department}</span>}
                      {e.location && <span>{e.location}</span>}
                      {off && (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-amber-800"
                        >
                          Off that day
                        </Badge>
                      )}
                      {isAbsent && <span>called off</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Recipients get the email (simulated - recorded and shown as an
            in-app notification) with one-tap responses. You assign the shift
            from the responses list.
          </p>

          <Button
            className="bg-emerald-700 text-white hover:bg-emerald-800"
            disabled={busy}
            onClick={submit}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Megaphone className="size-4" />
            )}
            Send blast to {effective.size} {effective.size === 1 ? "person" : "people"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
