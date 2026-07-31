import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Users } from "lucide-react";

export const metadata = { title: "Hiring" };

export default async function HiringPage() {
  const user = await currentUser();
  if (!user || !can(user, "hiring.manage")) redirect("/home");

  const openings = await db.jobOpening.findMany({
    include: {
      candidates: { select: { id: true, rejectedAt: true, hiredEmployeeId: true } },
      stages: { orderBy: { order: "asc" } },
    },
    orderBy: { openedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hiring</h1>
          <p className="text-sm text-muted-foreground">
            Openings and candidate pipelines.
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/careers" target="_blank" />}
        >
          <ExternalLink className="size-4" /> Public careers page
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {openings.map((o) => {
          const active = o.candidates.filter((c) => !c.rejectedAt && !c.hiredEmployeeId);
          const hired = o.candidates.filter((c) => c.hiredEmployeeId);
          return (
            <Link key={o.id} href={`/hiring/${o.id}`}>
              <Card className="h-full transition hover:border-emerald-500 hover:shadow">
                <CardContent className="space-y-2 pt-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{o.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {o.departmentName} · {o.locationName} · {o.employmentType}
                      </div>
                    </div>
                    {o.closedAt ? (
                      <Badge variant="outline">closed</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        open
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="size-4" />
                    {active.length} active candidate{active.length === 1 ? "" : "s"}
                    {hired.length > 0 && ` · ${hired.length} hired`}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
