"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { actOnApproval } from "@/lib/approvals";
import type { ActionResult } from "@/actions/people";

export async function decideApproval(
  approvalId: string,
  decision: "APPROVED" | "DENIED",
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, error: "Signed out" };
    await actOnApproval(approvalId, user, decision);
    revalidatePath("/inbox");
    revalidatePath("/home");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Signed out" };
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/inbox");
  return { ok: true };
}
