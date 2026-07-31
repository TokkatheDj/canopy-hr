import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/authz";
import type { Prisma } from "@/generated/prisma/client";

/** Writes an audit trail row. Call from every mutating server action. */
export async function audit(
  actor: SessionUser | null,
  entity: string,
  entityId: string,
  action: string,
  diff?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? "System",
      entity,
      entityId,
      action,
      diff: diff ?? undefined,
    },
  });
}
