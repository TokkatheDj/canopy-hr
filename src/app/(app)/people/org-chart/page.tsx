import Link from "next/link";
import { db } from "@/lib/db";
import { currentAsOf } from "@/lib/history";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Org Chart" };

type Node = {
  id: string;
  name: string;
  title: string;
  photoUrl: string | null;
  children: Node[];
  /** Set only for orphans: the offboarded manager they still report to. */
  formerManagerName?: string;
};

/**
 * Splits the org into real roots and ORPHANS.
 *
 * The query excludes offboarded people, so anyone whose manager has left is
 * looked up in `nodes` and not found. The old code treated "no parent found"
 * and "no manager" as the same thing, which quietly promoted those reports to
 * top-level executives sitting alongside the CEO. Nothing was wrong on screen
 * to notice — which is exactly why it needed separating: an unassigned report
 * is a real HR action item, not a hierarchy.
 */
function buildTree(
  employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    managerId: string | null;
    title: string;
  }>,
  formerManagerNames: Map<string, string> = new Map(),
): { roots: Node[]; orphans: Node[] } {
  const nodes = new Map<string, Node>();
  for (const e of employees) {
    nodes.set(e.id, {
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      title: e.title,
      photoUrl: e.photoUrl,
      children: [],
    });
  }
  const roots: Node[] = [];
  const orphans: Node[] = [];
  for (const e of employees) {
    const node = nodes.get(e.id)!;
    if (!e.managerId) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(e.managerId);
    if (parent) {
      parent.children.push(node);
    } else {
      node.formerManagerName = formerManagerNames.get(e.managerId);
      orphans.push(node);
    }
  }
  return { roots, orphans };
}

function OrgNode({ node, depth }: { node: Node; depth: number }) {
  return (
    <li className="relative">
      <Link
        href={`/people/${node.id}`}
        className="inline-flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 shadow-xs transition hover:border-emerald-500 hover:shadow"
      >
        <Avatar className="size-8">
          <AvatarImage src={node.photoUrl ?? undefined} alt="" />
          <AvatarFallback className="text-xs bg-emerald-100 text-emerald-800">
            {node.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </AvatarFallback>
        </Avatar>
        <span>
          <span className="block text-sm font-medium leading-tight">
            {node.name}
          </span>
          <span className="block text-xs text-muted-foreground leading-tight">
            {node.title}
          </span>
        </span>
        {node.children.length > 0 && (
          <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
            {node.children.length}
          </span>
        )}
      </Link>
      {node.formerManagerName && (
        <p className="mt-1 text-xs text-muted-foreground">
          was reporting to {node.formerManagerName}
        </p>
      )}
      {node.children.length > 0 && (
        <ul className="ml-5 mt-2 space-y-2 border-l-2 border-emerald-200 pl-4 dark:border-emerald-900">
          {node.children.map((c) => (
            <OrgNode key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function OrgChartPage() {
  const employees = await db.employee.findMany({
    where: { status: { not: "OFFBOARDED" } },
    include: { jobInfos: true },
    orderBy: { lastName: "asc" },
  });

  const flat = employees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    photoUrl: e.photoUrl,
    managerId: e.managerId,
    title: currentAsOf(e.jobInfos)?.title ?? "—",
  }));

  // Name the departed managers so this reads as "reassign these people",
  // not as an unexplained bucket.
  const activeIds = new Set(flat.map((e) => e.id));
  const formerManagerIds = [
    ...new Set(
      flat
        .filter((e) => e.managerId && !activeIds.has(e.managerId))
        .map((e) => e.managerId as string),
    ),
  ];
  const formerManagers = formerManagerIds.length
    ? await db.employee.findMany({
        where: { id: { in: formerManagerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const formerManagerNames = new Map(
    formerManagers.map((m) => [m.id, `${m.firstName} ${m.lastName}`]),
  );

  const { roots, orphans } = buildTree(flat, formerManagerNames);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/people" aria-label="Back to People" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Org Chart</h1>
      </div>
      <ul className="space-y-2 overflow-x-auto pb-4">
        {roots.map((r) => (
          <OrgNode key={r.id} node={r} depth={0} />
        ))}
      </ul>

      {orphans.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="text-sm font-semibold">
            Needs a manager ({orphans.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            These people report to someone who has been offboarded. They are not
            top-level — they need reassigning.
          </p>
          <ul className="space-y-2 pt-1">
            {orphans.map((o) => (
              <OrgNode key={o.id} node={o} depth={0} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
