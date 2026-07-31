"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";
import { decideApproval, markAllNotificationsRead } from "@/actions/approvals";

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"APPROVED" | "DENIED" | null>(null);

  async function act(decision: "APPROVED" | "DENIED") {
    setBusy(decision);
    const res = await decideApproval(approvalId, decision);
    setBusy(null);
    if (res.ok) {
      toast.success(decision === "APPROVED" ? "Approved" : "Denied");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
        disabled={busy !== null}
        onClick={() => act("APPROVED")}
      >
        {busy === "APPROVED" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy !== null}
        onClick={() => act("DENIED")}
      >
        {busy === "DENIED" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <X className="size-3.5" />
        )}
        Deny
      </Button>
    </div>
  );
}

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await markAllNotificationsRead();
        setBusy(false);
        router.refresh();
      }}
    >
      Mark all read
    </Button>
  );
}
