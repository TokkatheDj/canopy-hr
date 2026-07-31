"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, Plus, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  submitSurveyResponse,
  createSurveyCycle,
  closeSurveyCycle,
} from "@/actions/surveys";

export function SurveyRespondCard({
  cycleId,
  cycleName,
}: {
  cycleId: string;
  cycleName: string;
}) {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card className="border-emerald-300 dark:border-emerald-800">
      <CardHeader>
        <CardTitle className="text-base">{cycleName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          How likely are you to recommend Meridian Coffee Co. as a place to
          work?{" "}
          <span className="text-muted-foreground">
            (0 = not at all, 10 = extremely likely — your answer is anonymous)
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setScore(i)}
              className={cn(
                "size-9 rounded-md border text-sm font-medium transition",
                score === i
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "hover:border-emerald-400",
              )}
            >
              {i}
            </button>
          ))}
        </div>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything you'd like to share? (optional, anonymous)"
          className="min-h-[70px]"
        />
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={busy || score === null}
          onClick={async () => {
            if (score === null) return;
            setBusy(true);
            const res = await submitSurveyResponse(cycleId, score, comment);
            setBusy(false);
            if (res.ok) {
              toast.success("Thanks for the feedback!");
              router.refresh();
            } else {
              toast.error(res.error);
            }
          }}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizontal className="size-4" />
          )}
          Submit anonymously
        </Button>
      </CardContent>
    </Card>
  );
}

export function SurveyResults({
  enps,
  responseCount,
  headcount,
  distribution,
  comments,
}: {
  enps: number | null;
  responseCount: number;
  headcount: number;
  distribution: Array<{ score: string; count: number }>;
  comments: Array<{ score: number; comment: string }>;
}) {
  if (responseCount === 0) {
    return <p className="text-sm text-muted-foreground">No responses yet.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div
            className={cn(
              "text-3xl font-bold",
              enps !== null && enps >= 30
                ? "text-emerald-600"
                : enps !== null && enps >= 0
                  ? "text-amber-600"
                  : "text-red-600",
            )}
          >
            {enps !== null && enps > 0 ? "+" : ""}
            {enps}
          </div>
          <div className="text-xs text-muted-foreground">eNPS score</div>
        </div>
        <div>
          <div className="text-3xl font-bold">
            {Math.round((responseCount / Math.max(headcount, 1)) * 100)}%
          </div>
          <div className="text-xs text-muted-foreground">
            participation ({responseCount}/{headcount})
          </div>
        </div>
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distribution} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
            <XAxis dataKey="score" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "rgba(16,185,129,0.08)" }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {distribution.map((d) => (
                <Cell
                  key={d.score}
                  fill={
                    Number(d.score) >= 9
                      ? "#059669"
                      : Number(d.score) >= 7
                        ? "#fbbf24"
                        : "#f87171"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {comments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Anonymous comments</p>
          <ul className="space-y-1.5">
            {comments.slice(0, 8).map((c, i) => (
              <li key={i} className="rounded-lg border px-3 py-2 text-sm">
                <span className="mr-2 text-xs font-semibold text-muted-foreground">
                  {c.score}/10
                </span>
                {c.comment}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function NewSurveyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const [name, setName] = useState(
    `${now.toLocaleDateString("en-US", { month: "long", year: "numeric" })} Pulse Survey`,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="size-4" /> New survey
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Start an eNPS survey</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="sv-name">Survey name</Label>
          <Input id="sv-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            disabled={busy || name.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              const res = await createSurveyCycle(name);
              setBusy(false);
              if (res.ok) {
                toast.success("Survey opened");
                setOpen(false);
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Open survey
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloseSurveyButton({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await closeSurveyCycle(cycleId);
        setBusy(false);
        if (res.ok) {
          toast.success("Survey closed");
          router.refresh();
        } else toast.error(res.error);
      }}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />} Close
    </Button>
  );
}
