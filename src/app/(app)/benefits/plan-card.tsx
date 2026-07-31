"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { HeartPulse, Smile, Eye, PiggyBank, Loader2, Check } from "lucide-react";
import { enroll, unenroll } from "@/actions/benefits";

const TYPE_ICON: Record<string, React.ReactNode> = {
  MEDICAL: <HeartPulse className="size-5" />,
  DENTAL: <Smile className="size-5" />,
  VISION: <Eye className="size-5" />,
  RETIREMENT: <PiggyBank className="size-5" />,
};

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PlanCard({
  plan,
  enrollment,
  windowOpen,
}: {
  plan: {
    id: string;
    name: string;
    type: string;
    provider: string;
    description: string;
    tiers: Array<{ tier: string; employeeCostCentsPerPayPeriod: number }>;
  };
  enrollment: { tier: string | null; electionPct: number | null } | null;
  windowOpen: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tier, setTier] = useState(enrollment?.tier ?? plan.tiers[0]?.tier ?? "");
  const [pct, setPct] = useState(String(enrollment?.electionPct ?? 5));

  const isRetirement = plan.type === "RETIREMENT";

  async function save() {
    setBusy(true);
    const res = await enroll({
      planId: plan.id,
      tier: isRetirement ? undefined : tier,
      electionPct: isRetirement ? Number(pct) : undefined,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Enrolled in ${plan.name}`);
      setEditing(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function waive() {
    setBusy(true);
    const res = await unenroll(plan.id);
    setBusy(false);
    if (res.ok) {
      toast.success(`Waived ${plan.name}`);
      setEditing(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            {TYPE_ICON[plan.type]}
          </div>
          <div>
            <CardTitle className="text-base">{plan.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{plan.provider}</p>
          </div>
        </div>
        {enrollment ? (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
            <Check className="size-3" />
            {isRetirement ? `${enrollment.electionPct}% of pay` : enrollment.tier}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            not enrolled
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{plan.description}</p>

        {!editing ? (
          windowOpen && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                {enrollment ? "Change election" : "Enroll"}
              </Button>
              {enrollment && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={waive}>
                  {busy && <Loader2 className="size-3.5 animate-spin" />} Waive coverage
                </Button>
              )}
            </div>
          )
        ) : (
          <div className="space-y-3 rounded-lg border p-3">
            {isRetirement ? (
              <div className="space-y-1.5">
                <Label htmlFor={`pct-${plan.id}`}>
                  Contribution (% of gross pay, pre-tax)
                </Label>
                <Input
                  id={`pct-${plan.id}`}
                  type="number"
                  min="1"
                  max="50"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  className="w-24"
                />
              </div>
            ) : (
              <RadioGroup value={tier} onValueChange={(v) => v && setTier(String(v))}>
                {plan.tiers.map((t) => (
                  <div key={t.tier} className="flex items-center gap-2">
                    <RadioGroupItem value={t.tier} id={`${plan.id}-${t.tier}`} />
                    <Label
                      htmlFor={`${plan.id}-${t.tier}`}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      {t.tier}
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      {money(t.employeeCostCentsPerPayPeriod)}/paycheck
                    </span>
                  </div>
                ))}
              </RadioGroup>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={busy}
                onClick={save}
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />} Save election
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
