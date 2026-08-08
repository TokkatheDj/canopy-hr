"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { submitFeedback } from "@/actions/feedback";

export type FeedbackQA = {
  id: string;
  authorName: string;
  body: string;
  answer: string | null;
  createdAt: string;
};

export function FeedbackWidget({ recent }: { recent: FeedbackQA[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            className="fixed bottom-20 right-4 z-40 rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-800 md:bottom-6 md:right-6"
            aria-label="Questions or feedback"
          >
            <MessageCircleQuestion className="size-4" /> Questions?
          </Button>
        }
      />
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ask a question</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Stuck, confused, or found a bug? Ask here — the developer reads
            these directly and quick fixes usually ship the same day.
          </p>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. How do I approve a timesheet? / The X button doesn't work on..."
            className="min-h-[90px]"
          />
          <DialogFooter>
            <Button
              disabled={busy || body.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                const res = await submitFeedback(body, pathname);
                setBusy(false);
                if (res.ok) {
                  toast.success("Sent! Check back here for an answer.");
                  setBody("");
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(res.error);
                }
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send
            </Button>
          </DialogFooter>

          {recent.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Recent questions & answers
              </p>
              {recent.map((q) => (
                <div key={q.id} className="rounded-lg border p-2.5 text-sm">
                  <p>{q.body}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {q.authorName} · {fmt(q.createdAt)}
                  </p>
                  {q.answer ? (
                    <p className="mt-1.5 rounded-md bg-emerald-50 p-2 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                      {q.answer}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      Awaiting answer…
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
