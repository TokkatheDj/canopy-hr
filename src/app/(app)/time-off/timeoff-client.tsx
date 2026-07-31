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
import { Loader2, Plus, X } from "lucide-react";
import { requestTimeOff, cancelTimeOffRequest } from "@/actions/timeoff";

export function RequestTimeOffDialog({
  policies,
}: {
  policies: Array<{ id: string; name: string; balance: number }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    policyId: policies[0]?.id ?? "",
    startDate: today,
    endDate: today,
    hoursPerDay: "8",
    reason: "",
  });

  async function submit() {
    setBusy(true);
    const res = await requestTimeOff({
      ...form,
      hoursPerDay: Number(form.hoursPerDay),
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Request sent for approval");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-emerald-700 hover:bg-emerald-800 text-white">
            <Plus className="size-4" /> Request time off
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Request time off</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Policy</Label>
            <Select
              value={form.policyId}
              onValueChange={(v) => v && setForm({ ...form, policyId: v })}
              items={policies.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.balance}h available)`,
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {policies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.balance}h available)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="to-start">First day</Label>
              <Input
                id="to-start"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-end">Last day</Label>
              <Input
                id="to-end"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to-hpd">Hours per day</Label>
            <Input
              id="to-hpd"
              type="number"
              min="1"
              max="12"
              value={form.hoursPerDay}
              onChange={(e) => setForm({ ...form, hoursPerDay: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to-reason">Note (optional)</Label>
            <Textarea
              id="to-reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Family trip"
              className="min-h-[60px]"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Weekends and company holidays aren&apos;t counted. Your manager and
            HR will be asked to approve.
          </p>
        </div>
        <DialogFooter>
          <Button disabled={busy || !form.policyId} onClick={submit}>
            {busy && <Loader2 className="size-4 animate-spin" />} Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Cancel request"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await cancelTimeOffRequest(requestId);
        setBusy(false);
        if (res.ok) {
          toast.success("Request canceled");
          router.refresh();
        } else {
          toast.error(res.error);
        }
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
    </Button>
  );
}
