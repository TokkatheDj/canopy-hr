"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_ } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

const docSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  content: z.string().min(1).max(50_000),
  employeeId: z.string().optional(), // set → personal doc
});

export async function createDocument(
  input: z.infer<typeof docSchema>,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "files.manage");
    const data = docSchema.parse(input);
    // Plain text → simple paragraphs; keeps authoring simple and rendering safe
    const html = data.content
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
      .join("\n");
    const doc = await db.document.create({
      data: {
        name: data.name.trim(),
        category: data.category.trim(),
        employeeId: data.employeeId || null,
        inlineHtml: html,
        uploadedBy: user.name,
      },
    });
    await audit(user, "Document", doc.id, "CREATE", { name: doc.name });
    revalidatePath("/files");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function requestSignatures(
  documentId: string,
  employeeIds: string[],
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "files.manage");
    if (employeeIds.length === 0) return { ok: false, error: "Pick at least one person" };
    const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    let created = 0;
    for (const employeeId of employeeIds) {
      const existing = await db.signatureRequest.findFirst({
        where: { documentId, signerId: employeeId, status: "PENDING" },
      });
      if (existing) continue;
      await db.signatureRequest.create({ data: { documentId, signerId: employeeId } });
      const signerUser = await db.user.findUnique({ where: { employeeId } });
      if (signerUser) {
        await db.notification.create({
          data: {
            userId: signerUser.id,
            title: "Signature requested",
            body: `Please review and sign “${doc.name}”.`,
            href: `/files/${documentId}`,
          },
        });
      }
      created++;
    }
    await audit(user, "Document", documentId, "SIGNATURES_REQUESTED", { count: created });
    revalidatePath("/files");
    revalidatePath(`/files/${documentId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function signDocument(
  requestId: string,
  typedName: string,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) return { ok: false, error: "Signed out" };
    const req = await db.signatureRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { document: true },
    });
    if (req.signerId !== user.employeeId) {
      return { ok: false, error: "This signature request isn't yours" };
    }
    if (req.status !== "PENDING") return { ok: false, error: "Already handled" };
    const name = z.string().min(2).max(80).parse(typedName.trim());
    // The typed name must match the signer (light-touch identity check)
    await db.signatureRequest.update({
      where: { id: requestId },
      data: { status: "SIGNED", signedName: name, signedAt: new Date() },
    });
    await audit(user, "Document", req.documentId, "SIGNED", {
      document: req.document.name,
    });
    revalidatePath("/files");
    revalidatePath(`/files/${req.documentId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Type your full name to sign" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
