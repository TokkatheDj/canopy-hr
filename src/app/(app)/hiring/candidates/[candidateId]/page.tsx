import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { formatPay } from "@/lib/history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BadgeCheck, FileText } from "lucide-react";
import {
  CandidateStageSelect,
  CandidateNoteForm,
  OfferDialog,
  RejectButton,
  MarkHiredButton,
  CopyOfferLinkButton,
} from "./candidate-actions";

export const metadata = { title: "Candidate" };

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const EVENT_DOT: Record<string, string> = {
  APPLIED: "bg-sky-400",
  STAGE_CHANGE: "bg-emerald-400",
  NOTE: "bg-neutral-400",
  OFFER_SENT: "bg-amber-400",
  OFFER_SIGNED: "bg-emerald-500",
  HIRED: "bg-emerald-600",
  REJECTED: "bg-red-400",
};

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const user = await currentUser();
  if (!user || !can(user, "hiring.manage")) redirect("/home");

  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    include: {
      opening: { include: { stages: { orderBy: { order: "asc" } } } },
      stage: true,
      offer: true,
      events: { orderBy: { createdAt: "desc" } },
      hiredEmployee: true,
    },
  });
  if (!candidate) notFound();

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={
            <Link
              href={`/hiring/${candidate.openingId}`}
              aria-label="Back to pipeline"
            />
          }
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {candidate.firstName} {candidate.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {candidate.opening.title} · applied {fmtDate(candidate.appliedAt)}
          </p>
        </div>
        {candidate.hiredEmployeeId ? (
          <Badge className="bg-emerald-700 text-white">
            <BadgeCheck className="size-3.5" /> hired
          </Badge>
        ) : candidate.rejectedAt ? (
          <Badge variant="outline" className="text-red-600">
            not moving forward
          </Badge>
        ) : (
          <CandidateStageSelect
            candidateId={candidate.id}
            currentStageId={candidate.stageId}
            stages={candidate.opening.stages.map((s) => ({ id: s.id, name: s.name }))}
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div>
              <span className="text-muted-foreground">Email: </span>
              {candidate.email}
            </div>
            <div>
              <span className="text-muted-foreground">Phone: </span>
              {candidate.phone ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Resume: </span>
              {candidate.resumeName ? (
                <a
                  href={`/api/resumes/${candidate.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  <FileText className="size-3.5" />
                  {candidate.resumeName}
                </a>
              ) : (
                "—"
              )}
            </div>
            {candidate.hiredEmployee && (
              <div>
                <span className="text-muted-foreground">Employee record: </span>
                <Link
                  href={`/people/${candidate.hiredEmployee.id}`}
                  className="text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  view profile
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!candidate.rejectedAt && !candidate.hiredEmployeeId && (
              <>
                <OfferDialog
                  candidateId={candidate.id}
                  defaultTitle={candidate.opening.title}
                  hasOffer={Boolean(candidate.offer)}
                />
                {candidate.offer && <MarkHiredButton candidateId={candidate.id} />}
                <RejectButton candidateId={candidate.id} />
              </>
            )}
            {candidate.hiredEmployeeId && (
              <p className="text-sm text-muted-foreground">
                Candidate was hired — see their onboarding checklist under
                Onboarding.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {candidate.offer && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-base">
              Offer letter
              {candidate.offer.signedAt ? (
                <Badge className="ml-2 bg-emerald-100 text-emerald-800">
                  signed by {candidate.offer.signedName} · {fmtDate(candidate.offer.signedAt)}
                </Badge>
              ) : candidate.offer.acceptedAt ? (
                <Badge className="ml-2 bg-emerald-100 text-emerald-800">accepted</Badge>
              ) : (
                <Badge variant="outline" className="ml-2 text-amber-700">
                  awaiting signature
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">Title: </span>
                {candidate.offer.title}
              </div>
              <div>
                <span className="text-muted-foreground">Pay: </span>
                {formatPay(candidate.offer.payType, candidate.offer.salaryCents)}
              </div>
              <div>
                <span className="text-muted-foreground">Start: </span>
                {fmtDate(candidate.offer.startDate)}
              </div>
            </div>
            <div className="whitespace-pre-line rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
              {candidate.offer.body}
            </div>
            {candidate.offer.signToken && !candidate.offer.signedAt && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                Share the signing link with the candidate:
                <CopyOfferLinkButton token={candidate.offer.signToken} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {candidate.coverLetter && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application note</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm leading-relaxed">
            {candidate.coverLetter}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CandidateNoteForm candidateId={candidate.id} />
          <ul className="space-y-3">
            {candidate.events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${EVENT_DOT[e.kind] ?? "bg-neutral-300"}`}
                />
                <div>
                  <p>{e.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.actorName ? `${e.actorName} · ` : ""}
                    {fmtDateTime(e.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
