import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnswerForm } from "./feedback-client";

export const metadata = { title: "Feedback" };

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function FeedbackPage() {
  const user = await currentUser();
  if (!user || !can(user, "settings.manage")) redirect("/home");

  const items = await db.feedback.findMany({ orderBy: { createdAt: "desc" } });
  const openCount = items.filter((i) => !i.answer).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tester questions</h1>
        <p className="text-sm text-muted-foreground">
          Questions submitted from the in-app widget.
          {openCount > 0 && ` ${openCount} awaiting an answer.`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All questions
            {openCount > 0 && (
              <Badge className="ml-2 bg-amber-100 text-amber-800">
                {openCount} open
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet — questions from the &quot;Questions?&quot; widget will
              appear here.
            </p>
          ) : (
            items.map((f) => (
              <div key={f.id} className="rounded-lg border p-3">
                <p className="text-sm">{f.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {f.authorName} · {fmtDateTime(f.createdAt)}
                  {f.path && <span className="ml-1">· on {f.path}</span>}
                </p>
                {f.answer ? (
                  <div className="mt-2 rounded-md bg-emerald-50 p-2.5 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                    {f.answer}
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                      — {f.answeredBy}, {f.answeredAt && fmtDateTime(f.answeredAt)}
                    </p>
                  </div>
                ) : (
                  <AnswerForm feedbackId={f.id} />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
