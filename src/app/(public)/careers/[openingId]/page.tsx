import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Leaf, ArrowLeft, MapPin, Briefcase } from "lucide-react";
import { ApplyForm } from "./apply-form";

export const metadata = { title: "Apply · Meridian Coffee Co." };

export default async function OpeningPage({
  params,
}: {
  params: Promise<{ openingId: string }>;
}) {
  const { openingId } = await params;
  const opening = await db.jobOpening.findUnique({ where: { id: openingId } });
  if (!opening || !opening.isPublic || opening.closedAt) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950 dark:to-neutral-950">
      <header className="border-b bg-white/70 backdrop-blur dark:bg-neutral-950/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
            <Leaf className="size-6" /> Meridian Coffee Co.
          </div>
          <Link
            href="/careers"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> All openings
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{opening.title}</h1>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Briefcase className="size-3.5" /> {opening.departmentName} ·{" "}
              {opening.employmentType}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> {opening.locationName}
            </span>
          </div>
        </div>
        <div className="whitespace-pre-line rounded-xl border bg-card p-5 text-sm leading-relaxed">
          {opening.description}
        </div>
        <ApplyForm openingId={opening.id} />
      </main>
    </div>
  );
}
