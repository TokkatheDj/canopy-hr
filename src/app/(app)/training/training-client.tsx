"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { markTrainingComplete } from "@/actions/training";

export function MarkCompleteButton({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        Mark complete
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Button
        size="sm"
        className="bg-emerald-700 hover:bg-emerald-800 text-white"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await markTrainingComplete(courseId);
          setBusy(false);
          if (res.ok) {
            toast.success(`${courseName} marked complete`);
            setConfirming(false);
            router.refresh();
          } else {
            toast.error(res.error);
          }
        }}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        Confirm
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}
