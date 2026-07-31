import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { SignBlock, RequestSignaturesDialog } from "./document-client";

export const metadata = { title: "Document" };

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const user = await currentUser();
  if (!user) return null;

  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: {
      signatureRequests: { include: { signer: true }, orderBy: { requestedAt: "desc" } },
    },
  });
  if (!doc) notFound();

  // Personal docs are visible to their owner + admins only
  if (doc.employeeId && doc.employeeId !== user.employeeId && user.role !== "ADMIN") {
    notFound();
  }

  const isAdmin = can(user, "files.manage");
  const myPending = doc.signatureRequests.find(
    (s) => s.signerId === user.employeeId && s.status === "PENDING",
  );
  const signed = doc.signatureRequests.filter((s) => s.status === "SIGNED");

  const employees = isAdmin
    ? await db.employee.findMany({
        where: { status: { not: "OFFBOARDED" } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { lastName: "asc" },
      })
    : [];

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={<Link href="/files" aria-label="Back to files" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{doc.name}</h1>
            <p className="text-sm text-muted-foreground">
              {doc.category} · added by {doc.uploadedBy}
            </p>
          </div>
        </div>
        {isAdmin && (
          <RequestSignaturesDialog
            documentId={doc.id}
            employees={employees.map((e) => ({
              id: e.id,
              name: `${e.firstName} ${e.lastName}`,
            }))}
          />
        )}
      </div>

      {myPending && <SignBlock requestId={myPending.id} documentName={doc.name} />}

      <Card>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none py-6 [&_p]:my-3 [&_p]:leading-relaxed">
          {doc.inlineHtml ? (
            <div dangerouslySetInnerHTML={{ __html: doc.inlineHtml }} />
          ) : doc.blobUrl ? (
            <a
              href={doc.blobUrl}
              className="text-emerald-700 underline"
              target="_blank"
            >
              Download file
            </a>
          ) : (
            <p className="text-muted-foreground">This document has no content.</p>
          )}
        </CardContent>
      </Card>

      {(signed.length > 0 || (isAdmin && doc.signatureRequests.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signatures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {doc.signatureRequests.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span>
                  {s.signer.firstName} {s.signer.lastName}
                </span>
                {s.status === "SIGNED" ? (
                  <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-4" />
                    <span className="font-serif italic">{s.signedName}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.signedAt && fmt(s.signedAt)}
                    </span>
                  </span>
                ) : (
                  <Badge variant="outline" className="text-amber-600">
                    {s.status.toLowerCase()}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
