"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_, AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

export async function submitFeedback(
  body: string,
  path?: string,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user) throw new AuthzError("signed out");
    const text = z.string().min(3).max(2000).parse(body.trim());

    const feedback = await db.feedback.create({
      data: {
        authorName: `${user.name} (${user.role.toLowerCase()})`,
        path: path?.slice(0, 200) || null,
        body: text,
      },
    });

    // let admins know a question is waiting
    const admins = await db.user.findMany({ where: { role: "ADMIN" } });
    if (admins.length > 0) {
      await db.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          title: "New question from a tester",
          body: text.slice(0, 80),
          href: "/feedback",
        })),
      });
    }
    await audit(user, "Feedback", feedback.id, "CREATE");
    revalidatePath("/feedback");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Please write a bit more detail" };
    if (e instanceof AuthzError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function answerFeedback(
  feedbackId: string,
  answer: string,
): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "settings.manage");
    const text = z.string().min(1).max(4000).parse(answer.trim());
    await db.feedback.update({
      where: { id: feedbackId },
      data: { answer: text, answeredAt: new Date(), answeredBy: user.name },
    });
    await audit(user, "Feedback", feedbackId, "ANSWERED");
    revalidatePath("/feedback");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
