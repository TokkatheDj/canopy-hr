"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PenLine } from "lucide-react";
import { signOffer } from "@/actions/hiring";

export function OfferSignForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await signOffer(token, name);
        setBusy(false);
        if (res.ok) {
          toast.success("Offer signed — congratulations!");
          router.refresh();
        } else {
          toast.error(res.error);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="sign-name">
          Type your full legal name to accept and sign this offer
        </Label>
        <Input
          id="sign-name"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jordan Rivera"
          className="font-serif italic"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        By typing your name you agree this constitutes your electronic
        signature on this offer of employment.
      </p>
      <Button
        type="submit"
        disabled={busy || name.trim().length < 2}
        className="bg-emerald-700 hover:bg-emerald-800 text-white"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
        Sign offer
      </Button>
    </form>
  );
}
