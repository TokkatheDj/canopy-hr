import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const user = await currentUser();
  if (!user || !can(user, "hiring.manage")) {
    return new Response("Forbidden", { status: 403 });
  }
  const { candidateId } = await params;
  const candidate = await db.candidate.findUnique({
    where: { id: candidateId },
    select: { resumeData: true, resumeType: true, resumeName: true },
  });
  if (!candidate?.resumeData) return new Response("Not found", { status: 404 });

  const filename = (candidate.resumeName ?? "resume").replace(/[^\w.\- ]/g, "_");
  return new Response(Buffer.from(candidate.resumeData), {
    headers: {
      "Content-Type": candidate.resumeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
