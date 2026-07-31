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
};

function buildTree(
  employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    managerId: string | null;
    title: string;
  }>,
): Node[] {
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
  for (const e of employees) {
    const node = nodes.get(e.id)!;
    const parent = e.managerId ? nodes.get(e.managerId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
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

  const roots = buildTree(flat);

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
    </div>
  );
}
