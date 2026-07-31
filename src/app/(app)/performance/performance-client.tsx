"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, MessageSquarePlus, TrendingUp, CalendarPlus } from "lucide-react";
import {
  createGoal,
  checkinGoal,
  givePeerFeedback,
  createOneOnOne,
  createReviewCycle,
  closeReviewCycle,
} from "@/actions/performance";

export function NewGoalDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> New goal
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-title">Goal</Label>
            <Input id="g-title" value={form.title}
              placeholder="e.g. Ship the wholesale portal v2"
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-desc">Details (optional)</Label>
            <Textarea id="g-desc" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-due">Target date (optional)</Label>
            <Input id="g-due" type="date" value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || form.title.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              const res = await createGoal(form);
              setBusy(false);
              if (res.ok) {
                toast.success("Goal created");
                setOpen(false);
                setForm({ title: "", description: "", dueDate: "" });
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GoalCheckinDialog({
  goalId,
  currentPct,
  currentStatus,
}: {
  goalId: string;
  currentPct: number;
  currentStatus: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    progressPct: String(currentPct),
    status: currentStatus as "ON_TRACK" | "AT_RISK" | "BEHIND" | "COMPLETED",
    body: "",
  });

  const STATUS_ITEMS = [
    { value: "ON_TRACK", label: "On track" },
    { value: "AT_RISK", label: "At risk" },
    { value: "BEHIND", label: "Behind" },
    { value: "COMPLETED", label: "Completed" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <TrendingUp className="size-3.5" /> Check in
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Goal check-in</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-pct">Progress %</Label>
              <Input id="c-pct" type="number" min="0" max="100" value={form.progressPct}
                onChange={(e) => setForm({ ...form, progressPct: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                items={STATUS_ITEMS}
                onValueChange={(v) =>
                  v && setForm({ ...form, status: v as typeof form.status })
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ITEMS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-body">What&apos;s the latest?</Label>
            <Textarea id="c-body" value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.body.trim()}
            onClick={async () => {
              setBusy(true);
              const res = await checkinGoal({
                goalId,
                progressPct: Number(form.progressPct),
                status: form.status,
                body: form.body,
              });
              setBusy(false);
              if (res.ok) {
                toast.success("Check-in saved");
                setOpen(false);
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PeerFeedbackDialog({
  cycleId,
  colleagues,
}: {
  cycleId: string;
  colleagues: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subjectId, setSubjectId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <MessageSquarePlus className="size-4" /> Give peer feedback
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Give peer feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Colleague</Label>
          <Select
            value={subjectId || undefined}
            items={colleagues.map((c) => ({ value: c.id, label: c.name }))}
            onValueChange={(v) => v && setSubjectId(String(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a colleague" />
            </SelectTrigger>
            <SelectContent>
              {colleagues.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !subjectId}
            onClick={async () => {
              setBusy(true);
              const res = await givePeerFeedback(cycleId, subjectId);
              setBusy(false);
              if (res.ok && res.assessmentId) {
                setOpen(false);
                router.push(`/performance/assessments/${res.assessmentId}`);
              } else if (!res.ok) toast.error(res.error);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewOneOnOneDialog({
  colleagues,
}: {
  colleagues: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ participantBId: "", date: today, sharedNotes: "" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <CalendarPlus className="size-3.5" /> Log 1:1
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log a 1:1</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>With</Label>
            <Select
              value={form.participantBId || undefined}
              items={colleagues.map((c) => ({ value: c.id, label: c.name }))}
              onValueChange={(v) => v && setForm({ ...form, participantBId: String(v) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {colleagues.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oo-date">Date</Label>
            <Input id="oo-date" type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oo-notes">Shared notes (optional)</Label>
            <Textarea id="oo-notes" value={form.sharedNotes}
              onChange={(e) => setForm({ ...form, sharedNotes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.participantBId}
            onClick={async () => {
              setBusy(true);
              const res = await createOneOnOne(form);
              setBusy(false);
              if (res.ok) {
                toast.success("1:1 logged");
                setOpen(false);
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewCycleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const year = new Date().getFullYear();
  const [name, setName] = useState(`H2 ${year} Review Cycle`);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="size-4" /> Start review cycle
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Start a review cycle</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rc-name">Cycle name</Label>
          <Input id="rc-name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Self and manager reviews are created for every active employee.
          </p>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || name.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              const res = await createReviewCycle(name);
              setBusy(false);
              if (res.ok) {
                toast.success("Cycle started");
                setOpen(false);
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Start cycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloseCycleButton({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await closeReviewCycle(cycleId);
        setBusy(false);
        if (res.ok) {
          toast.success("Cycle closed");
          router.refresh();
        } else toast.error(res.error);
      }}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />} Close
    </Button>
  );
}
