"use client";

import { useState } from "react";
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

  const dirty = (Object.keys(form) as Array<keyof Fields>).some(
    (k) => form[k] !== initial[k],
  );

  async function submit() {
    setBusy(true);
    const res = await requestInfoChange(form);
    setBusy(false);
    if (res.ok) {
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
      <Button onClick={submit} disabled={!dirty || busy}>
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <SendHorizontal className="size-4" />
        )}
        Submit for approval
      </Button>
    </div>
  );
}
