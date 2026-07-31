import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AssessmentForm } from "./assessment-form";

export const metadata = { title: "Review" };

const KIND_LABEL: Record<string, string> = {
  SELF: "Self review",
  MANAGER: "Manager review",
  PEER: "Peer feedback",
};

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  const user = await currentUser();
  if (!user?.employeeId) notFound();

  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    include: { cycle: true, subject: true },
  });
  if (!assessment) notFound();
  // Author writes it; the subject may read their own submitted reviews; admin may read
  const isAuthor = assessment.authorId === user.employeeId;
  const isSubject = assessment.subjectId === user.employeeId;
  if (!isAuthor && !isSubject && user.role !== "ADMIN") notFound();

  const questions = assessment.cycle.questions as Array<{
    id: string;
    prompt: string;
    type: "text" | "rating";
  }>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/performance" aria-label="Back to performance" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {KIND_LABEL[assessment.kind]}
            {assessment.kind !== "SELF" &&
              ` — ${assessment.subject.firstName} ${assessment.subject.lastName}`}
          </h1>
          <p className="text-sm text-muted-foreground">{assessment.cycle.name}</p>
        </div>
      </div>

      <AssessmentForm
        assessmentId={assessment.id}
        questions={questions}
        initialAnswers={
          (assessment.answers as Record<string, string | number> | null) ?? {}
        }
        readOnly={!isAuthor || assessment.status === "SUBMITTED" || assessment.cycle.status !== "OPEN"}
        submitted={assessment.status === "SUBMITTED"}
      />
    </div>
  );
}
