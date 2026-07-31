import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, PenLine } from "lucide-react";
import { NewDocumentDialog } from "./files-client";

export const metadata = { title: "Files" };

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function FilesPage() {
  const user = await currentUser();
  if (!user) return null;

  const isAdmin = can(user, "files.manage");

  const [companyDocs, myDocs, mySignatures] = await Promise.all([
    db.document.findMany({
      where: { employeeId: null },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    user.employeeId
      ? db.document.findMany({
          where: { employeeId: user.employeeId },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    user.employeeId
      ? db.signatureRequest.findMany({
          where: { signerId: user.employeeId, status: "PENDING" },
          include: { document: true },
        })
      : Promise.resolve([]),
  ]);

  const byCategory = new Map<string, typeof companyDocs>();
  for (const d of companyDocs) {
    const list = byCategory.get(d.category) ?? [];
    list.push(d);
    byCategory.set(d.category, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Files</h1>
          <p className="text-sm text-muted-foreground">
            Company documents, your personal files, and signature requests.
          </p>
        </div>
        {isAdmin && <NewDocumentDialog />}
      </div>

      {mySignatures.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenLine className="size-4 text-amber-500" /> Needs your signature
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mySignatures.map((s) => (
              <Link
                key={s.id}
                href={`/files/${s.documentId}`}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition hover:border-amber-400"
              >
                <span className="font-medium">{s.document.name}</span>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  sign now
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {[...byCategory.entries()].map(([category, docs]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {docs.map((d) => (
              <Link
                key={d.id}
                href={`/files/${d.id}`}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition hover:border-emerald-500"
              >
                <span className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  {d.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {d.uploadedBy} · {fmtDate(d.createdAt)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}

      {myDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {myDocs.map((d) => (
              <Link
                key={d.id}
                href={`/files/${d.id}`}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition hover:border-emerald-500"
              >
                <span className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  {d.name}
                </span>
                <span className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
