"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { moveCandidate } from "@/actions/hiring";
import { FileSignature, BadgeCheck } from "lucide-react";

type Stage = { id: string; name: string };
type CandidateCard = {
  id: string;
  stageId: string;
  name: string;
  email: string;
  hired: boolean;
  hasOffer: boolean;
  appliedAt: string;
};

function CandidateItem({
  candidate,
  dragging,
}: {
  candidate: CandidateCard;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-2.5 text-sm shadow-xs",
        dragging && "rotate-2 shadow-lg",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <Link
          href={`/hiring/candidates/${candidate.id}`}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {candidate.name}
        </Link>
        {candidate.hired ? (
          <BadgeCheck className="size-4 text-emerald-600" />
        ) : candidate.hasOffer ? (
          <FileSignature className="size-4 text-amber-500" />
        ) : null}
      </div>
      <div className="truncate text-xs text-muted-foreground">{candidate.email}</div>
    </div>
  );
}

function DraggableCandidate({ candidate }: { candidate: CandidateCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: candidate.id,
    disabled: candidate.hired,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none", isDragging && "opacity-40", !candidate.hired && "cursor-grab")}
    >
      <CandidateItem candidate={candidate} />
    </div>
  );
}

function StageColumn({
  stage,
  candidates,
}: {
  stage: Stage;
  candidates: CandidateCard[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-56 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2",
        isOver && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950",
      )}
    >
      <div className="flex items-center justify-between px-1 text-sm font-semibold">
        {stage.name}
        <Badge variant="outline" className="text-xs">
          {candidates.length}
        </Badge>
      </div>
      {candidates.map((c) => (
        <DraggableCandidate key={c.id} candidate={c} />
      ))}
      {candidates.length === 0 && (
        <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
          drop here
        </div>
      )}
    </div>
  );
}

export function PipelineBoard({
  stages,
  candidates: initial,
}: {
  stages: Stage[];
  candidates: CandidateCard[];
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const candidateId = String(e.active.id);
    const stageId = e.over ? String(e.over.id) : null;
    if (!stageId) return;
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate || candidate.stageId === stageId) return;

    const prev = candidates;
    setCandidates((cs) =>
      cs.map((c) => (c.id === candidateId ? { ...c, stageId } : c)),
    );
    const res = await moveCandidate(candidateId, stageId);
    if (!res.ok) {
      setCandidates(prev);
      toast.error(res.error);
    } else {
      router.refresh();
    }
  }

  const active = candidates.find((c) => c.id === activeId);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((s) => (
          <StageColumn
            key={s.id}
            stage={s}
            candidates={candidates.filter((c) => c.stageId === s.id)}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? <CandidateItem candidate={active} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
