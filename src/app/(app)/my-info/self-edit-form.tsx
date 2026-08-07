"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, SendHorizontal } from "lucide-react";
import { requestInfoChange } from "@/actions/people";

type Fields = {
  preferredName: string;
  personalEmail: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

const LABELS: Record<keyof Fields, string> = {
  preferredName: "Preferred name",
  personalEmail: "Personal email",
  phone: "Phone",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
};

export function SelfEditForm({ initial }: { initial: Fields }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  // What was last submitted successfully. `busy` alone was not enough: a change
  // request does not alter the employee record until it is APPROVED, so after
  // submitting, `initial` still held the old values, the form was still dirty,
  // and the button re-enabled itself — a second click filed a second identical
  // request for the same change.
  const [submitted, setSubmitted] = useState<Fields | null>(null);
  // Belt to the disabled prop's braces: two fast clicks can both land before
  // React re-renders with busy=true.
  const inFlight = useRef(false);

  const keys = Object.keys(form) as Array<keyof Fields>;
  const dirty = keys.some((k) => form[k] !== initial[k]);
  const unchangedSinceSubmit =
    submitted !== null && keys.every((k) => form[k] === submitted[k]);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const res = await requestInfoChange(form);
    setBusy(false);
    inFlight.current = false;
    if (res.ok) {
      setSubmitted(form);
      toast.success("Change request submitted for approval");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(form) as Array<keyof Fields>).map((key) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`f-${key}`}>{LABELS[key]}</Label>
            <Input
              id={`f-${key}`}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={
                form[key] !== initial[key] ? "border-amber-400" : undefined
              }
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!dirty || busy || unchangedSinceSubmit}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizontal className="size-4" />
          )}
          Submit for approval
        </Button>
        {unchangedSinceSubmit && (
          <span className="text-sm text-muted-foreground">
            Submitted — waiting for approval. Edit a field to submit again.
          </span>
        )}
      </div>
    </div>
  );
}
