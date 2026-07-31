import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { PipelineBoard } from "./pipeline-board";

export const metadata = { title: "Pipeline" };

export default async function OpeningPipelinePage({
  params,
}: {
  params: Promise<{ openingId: string }>;
}) {
  const { openingId } = await params;
  const user = await currentUser();
  if (!user || !can(user, "hiring.manage")) redirect("/home");

  const opening = await db.jobOpening.findUnique({
    where: { id: openingId },
    include: {
      stages: { orderBy: { order: "asc" } },
      candidates: {
        where: { rejectedAt: null },
        include: { offer: { select: { id: true } } },
        orderBy: { appliedAt: "asc" },
      },
    },
  });
  if (!opening) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/hiring" aria-label="Back to hiring" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{opening.title}</h1>
          <p className="text-sm text-muted-foreground">
            {opening.departmentName} · {opening.locationName} — drag candidates
            between stages
          </p>
        </div>
      </div>

      <PipelineBoard
        stages={opening.stages.map((s) => ({ id: s.id, name: s.name }))}
        candidates={opening.candidates.map((c) => ({
          id: c.id,
          stageId: c.stageId,
          name: `${c.firstName} ${c.lastName}`,
          email: c.email,
          hired: Boolean(c.hiredEmployeeId),
          hasOffer: Boolean(c.offer),
          appliedAt: c.appliedAt.toISOString(),
        }))}
      />
    </div>
  );
}
