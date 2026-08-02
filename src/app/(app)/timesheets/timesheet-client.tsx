"use client";

import { useEffect, useState } from "react";
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
import { Loader2, Play, Square, Plus, Trash2, SendHorizontal } from "lucide-react";
import {
  clockIn,
  clockOut,
  addManualEntry,
  deleteEntry,
  submitPeriod,
} from "@/actions/timesheets";
import type { ActionResult } from "@/actions/people";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<ActionResult>, successMsg?: string) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.ok) {
      if (successMsg) toast.success(successMsg);
      router.refresh();
      return true;
    }
    toast.error(res.error);
    return false;
  }
  return { busy, run };
}

export function ClockButtons({
  clockedIn,
  clockedInSince,
  periodEditable,
}: {
  clockedIn: boolean;
  clockedInSince: string | null;
  periodEditable: boolean;
}) {
  const { busy, run } = useAction();
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!clockedInSince) return;
    const tick = () => {
      const ms = Date.now() - new Date(clockedInSince).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setElapsed(`${h}:${String(m).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [clockedInSince]);

  if (!periodEditable) return null;

  return clockedIn ? (
    <Button
      className="bg-red-600 hover:bg-red-700 text-white"
      disabled={busy}
      onClick={() => run(clockOut, "Clocked out")}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
      Clock out {elapsed && `(${elapsed})`}
    </Button>
  ) : (
    <Button
      className="bg-emerald-700 hover:bg-emerald-800 text-white"
      disabled={busy}
      onClick={() => run(clockIn, "Clocked in — have a good shift!")}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      Clock in
    </Button>
  );
}

export function AddEntryDialog() {
  const [open, setOpen] = useState(false);
  const { busy, run } = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today,
    hours: "8",
    timeIn: "",
    timeOut: "",
    note: "",
  });

  // keep the hours field in sync when both clock times are set
  const withTimes = (next: typeof form) => {
    if (next.timeIn && next.timeOut) {
      const [ih, im] = next.timeIn.split(":").map(Number);
      const [oh, om] = next.timeOut.split(":").map(Number);
      const diff = (oh * 60 + om - (ih * 60 + im)) / 60;
      if (diff > 0) next = { ...next, hours: String(Math.round(diff * 100) / 100) };
    }
    return next;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add hours
          </Button>
        }
      />
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Add hours manually</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="me-date">Date</Label>
            <Input
              id="me-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="me-in">Time in (optional)</Label>
              <Input
                id="me-in"
                type="time"
                value={form.timeIn}
                onChange={(e) => setForm(withTimes({ ...form, timeIn: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="me-out">Time out (optional)</Label>
              <Input
                id="me-out"
                type="time"
                value={form.timeOut}
                onChange={(e) => setForm(withTimes({ ...form, timeOut: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="me-hours">Hours</Label>
            <Input
              id="me-hours"
              type="number"
              min="0.5"
              max="16"
              step="0.5"
              value={form.hours}
              disabled={Boolean(form.timeIn && form.timeOut)}
              onChange={(e) => setForm({ ...form, hours: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="me-note">Note (optional)</Label>
            <Input
              id="me-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. Catering event"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              const ok = await run(
                () =>
                  addManualEntry({
                    date: form.date,
                    hours: Number(form.hours),
                    timeIn: form.timeIn || undefined,
                    timeOut: form.timeOut || undefined,
                    note: form.note,
                  }),
                "Hours added",
              );
              if (ok) setOpen(false);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteEntryButton({ entryId }: { entryId: string }) {
  const { busy, run } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Delete entry"
      disabled={busy}
      onClick={() => run(() => deleteEntry(entryId))}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Trash2 className="size-3.5" />
      )}
    </Button>
  );
}

export function SubmitPeriodButton({ periodId }: { periodId: string }) {
  const { busy, run } = useAction();
  return (
    <Button
      size="sm"
      className="bg-emerald-700 hover:bg-emerald-800 text-white"
      disabled={busy}
      onClick={() => run(() => submitPeriod(periodId), "Timesheet submitted for approval")}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <SendHorizontal className="size-3.5" />
      )}
      Submit for approval
    </Button>
  );
}
