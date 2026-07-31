"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Banknote, Check, Trash2 } from "lucide-react";
import {
  createDraftRun,
  approveRun,
  markRunPaid,
  deleteDraftRun,
} from "@/actions/payroll";

export function CreateRunButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      className="bg-emerald-700 hover:bg-emerald-800 text-white"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await createDraftRun();
        setBusy(false);
        if (res.ok) {
          toast.success("Draft run created");
          if (res.runId) router.push(`/payroll/${res.runId}`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      }}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
      Run payroll
    </Button>
  );
}

export function RunActions({
  runId,
  status,
}: {
  runId: string;
  status: "DRAFT" | "APPROVED" | "PAID";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    msg: string,
  ) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) {
      toast.success(msg);
      if (key === "delete") router.push("/payroll");
      router.refresh();
    } else {
      toast.error(res.error ?? "Failed");
    }
  }

  if (status === "PAID") return null;

  return (
    <div className="flex gap-2">
      {status === "DRAFT" && (
        <>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => act("delete", () => deleteDraftRun(runId), "Draft deleted")}
          >
            {busy === "delete" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete draft
          </Button>
          <Button
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
            disabled={busy !== null}
            onClick={() => act("approve", () => approveRun(runId), "Run approved")}
          >
            {busy === "approve" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve run
          </Button>
        </>
      )}
      {status === "APPROVED" && (
        <Button
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
          disabled={busy !== null}
          onClick={() => act("pay", () => markRunPaid(runId), "Run marked as paid 🎉")}
        >
          {busy === "pay" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Banknote className="size-4" />
          )}
          Mark as paid
        </Button>
      )}
    </div>
  );
}
