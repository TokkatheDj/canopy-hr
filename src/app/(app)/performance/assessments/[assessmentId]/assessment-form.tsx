"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, SendHorizontal, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveAssessment } from "@/actions/performance";

export function AssessmentForm({
  assessmentId,
  questions,
  initialAnswers,
  readOnly,
  submitted,
}: {
  assessmentId: string;
  questions: Array<{ id: string; prompt: string; type: "text" | "rating" }>;
  initialAnswers: Record<string, string | number>;
  readOnly: boolean;
  submitted: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string | number>>(initialAnswers);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);

  async function persist(submit: boolean) {
    setBusy(submit ? "submit" : "save");
    const res = await saveAssessment(assessmentId, answers, submit);
    setBusy(null);
    if (res.ok) {
      toast.success(submit ? "Review submitted 🎉" : "Draft saved");
      if (submit) router.push("/performance");
      else router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const complete = questions.every((q) => {
    const a = answers[q.id];
    return a !== undefined && a !== "" && a !== 0;
  });

  return (
    <div className="space-y-4">
      {submitted && (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
          submitted
        </Badge>
      )}
      {questions.map((q) => (
        <Card key={q.id}>
          <CardContent className="space-y-2 py-4">
            <Label className="text-sm font-medium">{q.prompt}</Label>
            {q.type === "text" ? (
              <Textarea
                value={String(answers[q.id] ?? "")}
                disabled={readOnly}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                className="min-h-[100px]"
              />
            ) : (
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={readOnly}
                    aria-label={`${n} of 5`}
                    onClick={() => setAnswers({ ...answers, [q.id]: n })}
                    className={cn(
                      "rounded-md p-1.5 transition",
                      !readOnly && "hover:scale-110",
                    )}
                  >
                    <Star
                      className={cn(
                        "size-7",
                        Number(answers[q.id] ?? 0) >= n
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {!readOnly && (
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={() => persist(false)}>
            {busy === "save" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save draft
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={busy !== null || !complete}
            onClick={() => persist(true)}
          >
            {busy === "submit" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizontal className="size-4" />
            )}
            Submit review
          </Button>
        </div>
      )}
    </div>
  );
}
