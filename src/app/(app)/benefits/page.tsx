import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/history";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanCard } from "./plan-card";
import { CalendarClock } from "lucide-react";

export const metadata = { title: "Benefits" };

export default async function BenefitsPage() {
  const user = await currentUser();
  if (!user?.employeeId) {
    return <p className="text-muted-foreground">No employee record linked.</p>;
  }

  const now = new Date();
  const [plans, myEnrollments, window] = await Promise.all([
    db.benefitPlan.findMany({ orderBy: { type: "asc" } }),
    db.benefitEnrollment.findMany({ where: { employeeId: user.employeeId } }),
    db.enrollmentWindow.findFirst({
      where: { startDate: { lte: now }, endDate: { gte: now } },
    }),
  ]);

  const byPlan = new Map(myEnrollments.map((e) => [e.planId, e]));

  const perPeriodCost = myEnrollments.reduce((acc, e) => {
    if (!e.active || !e.tier) return acc;
    const plan = plans.find((p) => p.id === e.planId);
    const tiers = (plan?.tiers as Array<{ tier: string; employeeCostCentsPerPayPeriod: number }>) ?? [];
    return acc + (tiers.find((t) => t.tier === e.tier)?.employeeCostCentsPerPayPeriod ?? 0);
  }, 0);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Benefits</h1>
        <p className="text-sm text-muted-foreground">
          Your coverage elections. Costs come out of each paycheck pre-tax.
        </p>
      </div>

      {window ? (
        <Card className="border-emerald-300 dark:border-emerald-800">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <CalendarClock className="size-5 text-emerald-600" />
            <div className="flex-1 text-sm">
              <span className="font-medium">{window.name} is open</span>{" "}
              <span className="text-muted-foreground">
                through {fmt(window.endDate)} — you can change any election below.
              </span>
            </div>
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {formatMoney(perPeriodCost)} / paycheck
            </Badge>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-3 text-sm text-muted-foreground">
            Enrollment is currently closed. Elections can be changed during the
            next open enrollment window.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => {
          const enrollment = byPlan.get(plan.id);
          return (
            <PlanCard
              key={plan.id}
              plan={{
                id: plan.id,
                name: plan.name,
                type: plan.type,
                provider: plan.provider,
                description: plan.description,
                tiers: (plan.tiers as Array<{ tier: string; employeeCostCentsPerPayPeriod: number }>) ?? [],
              }}
              enrollment={
                enrollment && enrollment.active
                  ? { tier: enrollment.tier, electionPct: enrollment.electionPct }
                  : null
              }
              windowOpen={Boolean(window)}
            />
          );
        })}
      </div>
    </div>
  );
}
