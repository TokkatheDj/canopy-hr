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
import { Loader2, FileSignature, UserRoundCheck, UserRoundX, Link2, Check } from "lucide-react";
import {
  moveCandidate,
  addCandidateNote,
  sendOffer,
  markHired,
  rejectCandidate,
} from "@/actions/hiring";

export function CandidateStageSelect({
  candidateId,
  currentStageId,
  stages,
}: {
  candidateId: string;
  currentStageId: string;
  stages: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentStageId);
  const [busy, setBusy] = useState(false);

  return (
    <Select
      value={value}
      items={stages.map((s) => ({ value: s.id, label: s.name }))}
      onValueChange={async (v) => {
        if (!v || v === value) return;
        setBusy(true);
        const prev = value;
        setValue(String(v));
        const res = await moveCandidate(candidateId, String(v));
        setBusy(false);
        if (!res.ok) {
          setValue(prev);
          toast.error(res.error);
        } else {
          router.refresh();
        }
      }}
    >
      <SelectTrigger className="w-40" disabled={busy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CandidateNoteForm({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add an interview note..."
        className="min-h-[56px]"
      />
      <Button
        disabled={busy || !body.trim()}
        onClick={async () => {
          setBusy(true);
          const res = await addCandidateNote(candidateId, body);
          setBusy(false);
          if (res.ok) {
            setBody("");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Add"}
      </Button>
    </div>
  );
}

export function OfferDialog({
  candidateId,
  defaultTitle,
  hasOffer,
}: {
  candidateId: string;
  defaultTitle: string;
  hasOffer: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 21);
  const [form, setForm] = useState({
    title: defaultTitle,
    payType: "SALARY" as "SALARY" | "HOURLY",
    amountDollars: "",
    startDate: nextMonth.toISOString().slice(0, 10),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <FileSignature className="size-3.5" />
            {hasOffer ? "Revise offer" : "Send offer"}
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{hasOffer ? "Revise offer" : "Send an offer"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="o-title">Job title</Label>
            <Input id="o-title" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pay type</Label>
              <Select
                value={form.payType}
                items={[
                  { value: "SALARY", label: "Salary (annual)" },
                  { value: "HOURLY", label: "Hourly" },
                ]}
                onValueChange={(v) =>
                  v && setForm({ ...form, payType: v as "SALARY" | "HOURLY" })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALARY">Salary (annual)</SelectItem>
                  <SelectItem value="HOURLY">Hourly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-amount">
                {form.payType === "SALARY" ? "Salary ($/yr)" : "Rate ($/hr)"}
              </Label>
              <Input id="o-amount" type="number" min="1" value={form.amountDollars}
                onChange={(e) => setForm({ ...form, amountDollars: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-start">Start date</Label>
            <Input id="o-start" type="date" value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.amountDollars || !form.title}
            onClick={async () => {
              setBusy(true);
              const res = await sendOffer({
                candidateId,
                title: form.title,
                payType: form.payType,
                amountDollars: Number(form.amountDollars),
                startDate: form.startDate,
              });
              setBusy(false);
              if (res.ok) {
                toast.success("Offer letter sent");
                setOpen(false);
                router.refresh();
              } else {
                toast.error(res.error);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Send offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MarkHiredButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      className="bg-emerald-700 hover:bg-emerald-800 text-white"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await markHired(candidateId);
        setBusy(false);
        if (res.ok) {
          toast.success("Hired! Employee record + onboarding checklist created");
          if (res.login) {
            toast.info(
              `Login created for the new hire — ${res.login.email} · temp password: ${res.login.tempPassword}`,
              { duration: 60_000, closeButton: true },
            );
          }
          router.refresh();
        } else {
          toast.error(res.error);
        }
      }}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <UserRoundCheck className="size-3.5" />
      )}
      Mark hired
    </Button>
  );
}

export function CopyOfferLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(`${location.origin}/offers/${token}`);
        setCopied(true);
        toast.success("Signing link copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      Copy signing link
    </Button>
  );
}

export function RejectButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await rejectCandidate(candidateId);
        setBusy(false);
        if (res.ok) {
          toast.success("Candidate marked as not moving forward");
          router.refresh();
        } else {
          toast.error(res.error);
        }
      }}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <UserRoundX className="size-3.5" />
      )}
      Reject
    </Button>
  );
}
