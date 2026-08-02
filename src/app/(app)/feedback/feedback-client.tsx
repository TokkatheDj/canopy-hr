"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { answerFeedback } from "@/actions/feedback";

export function AnswerForm({ feedbackId }: { feedbackId: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-2 flex gap-2">
      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Write an answer — the tester sees it in the widget..."
        className="min-h-[56px]"
      />
      <Button
        disabled={busy || !answer.trim()}
        onClick={async () => {
          setBusy(true);
          const res = await answerFeedback(feedbackId, answer);
          setBusy(false);
          if (res.ok) {
            toast.success("Answer posted");
            router.refresh();
          } else {
            toast.error(res.error);
          }
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Answer"}
      </Button>
    </div>
  );
}
