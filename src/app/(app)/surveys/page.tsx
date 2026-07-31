import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SurveyRespondCard,
  SurveyResults,
  NewSurveyDialog,
  CloseSurveyButton,
} from "./surveys-client";

export const metadata = { title: "Surveys" };

function computeEnps(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

export default async function SurveysPage() {
  const user = await currentUser();
  if (!user?.employeeId) {
    return <p className="text-muted-foreground">No employee record linked.</p>;
  }
  const isAdmin = can(user, "surveys.manage");

  const cycles = await db.surveyCycle.findMany({
    include: {
      responses: true,
      participations: { select: { employeeId: true } },
    },
    orderBy: { startDate: "desc" },
  });

  const openCycle = cycles.find((c) => c.status === "OPEN");
  const alreadyResponded = openCycle
    ? openCycle.participations.some((p) => p.employeeId === user.employeeId)
    : false;

  const headcount = await db.employee.count({ where: { status: "ACTIVE" } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Surveys</h1>
          <p className="text-sm text-muted-foreground">
            Anonymous employee satisfaction (eNPS) surveys.
          </p>
        </div>
        {isAdmin && !openCycle && <NewSurveyDialog />}
      </div>

      {openCycle && !alreadyResponded && (
        <SurveyRespondCard cycleId={openCycle.id} cycleName={openCycle.name} />
      )}
      {openCycle && alreadyResponded && (
        <Card className="border-emerald-300 dark:border-emerald-800">
          <CardContent className="py-4 text-sm">
            ✅ You&apos;ve responded to <strong>{openCycle.name}</strong> — thank
            you! Responses are anonymous.
          </CardContent>
        </Card>
      )}

      {isAdmin &&
        cycles.map((c) => {
          const scores = c.responses.map((r) => r.score);
          const enps = computeEnps(scores);
          const distribution = Array.from({ length: 11 }, (_, i) => ({
            score: String(i),
            count: scores.filter((s) => s === i).length,
          }));
          const comments = c.responses
            .filter((r) => r.comment)
            .map((r) => ({ score: r.score, comment: r.comment! }));
          return (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{c.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={c.status === "OPEN" ? "default" : "outline"}
                    className={c.status === "OPEN" ? "bg-emerald-700 text-white" : undefined}
                  >
                    {c.status.toLowerCase()}
                  </Badge>
                  {c.status === "OPEN" && <CloseSurveyButton cycleId={c.id} />}
                </div>
              </CardHeader>
              <CardContent>
                <SurveyResults
                  enps={enps}
                  responseCount={scores.length}
                  headcount={headcount}
                  distribution={distribution}
                  comments={comments}
                />
              </CardContent>
            </Card>
          );
        })}

      {!isAdmin && !openCycle && (
        <p className="text-sm text-muted-foreground">
          No survey is open right now — you&apos;ll see it here (and get a
          notification) when the next one starts.
        </p>
      )}
    </div>
  );
}
