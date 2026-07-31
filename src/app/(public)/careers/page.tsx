import Link from "next/link";
import { db } from "@/lib/db";
import { Leaf, MapPin, Briefcase } from "lucide-react";

export const metadata = { title: "Careers at Meridian Coffee Co." };

export default async function CareersPage() {
  const openings = await db.jobOpening.findMany({
    where: { isPublic: true, closedAt: null },
    include: { candidates: { select: { id: true } } },
    orderBy: { openedAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950 dark:to-neutral-950">
      <header className="border-b bg-white/70 backdrop-blur dark:bg-neutral-950/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
            <Leaf className="size-6" /> Meridian Coffee Co.
          </div>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Employee sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Join our crew</h1>
          <p className="mt-1 text-muted-foreground">
            We roast, brew, and ship exceptional coffee from Portland and
            Austin — and we&apos;re growing.
          </p>
        </div>
        <div className="space-y-3">
          {openings.length === 0 && (
            <p className="text-muted-foreground">
              No open roles right now — check back soon!
            </p>
          )}
          {openings.map((o) => (
            <Link
              key={o.id}
              href={`/careers/${o.id}`}
              className="block rounded-xl border bg-card p-4 shadow-xs transition hover:border-emerald-500 hover:shadow"
            >
              <div className="font-semibold">{o.title}</div>
              <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Briefcase className="size-3.5" /> {o.departmentName} ·{" "}
                  {o.employmentType}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" /> {o.locationName}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
