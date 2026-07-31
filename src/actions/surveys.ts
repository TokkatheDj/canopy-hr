"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_, AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

/**
 * Anonymity by construction: the response row never references the employee;
 * a separate participation row (unique per cycle+employee) prevents double
 * submission. The two writes share a transaction.
 */
export async function submitSurveyResponse(
  cycleId: string,
  score: number,
  comment: string,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const parsedScore = z.number().int().min(0).max(10).parse(score);
    const parsedComment = z.string().max(2000).parse(comment.trim());

    const cycle = await db.surveyCycle.findUniqueOrThrow({ where: { id: cycleId } });
    if (cycle.status !== "OPEN") return { ok: false, error: "This survey is closed" };

    await db.$transaction([
      db.surveyParticipation.create({
        data: { cycleId, employeeId: user.employeeId },
      }),
      db.surveyResponse.create({
        data: { cycleId, score: parsedScore, comment: parsedComment || null },
      }),
    ]);
    revalidatePath("/surveys");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { ok: false, error: "You've already responded to this survey" };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function createSurveyCycle(name: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "surveys.manage");
    const cycleName = z.string().min(3).max(80).parse(name.trim());
    const now = new Date();
    await db.surveyCycle.create({
      data: {
        name: cycleName,
        startDate: now,
        endDate: new Date(now.getTime() + 14 * 24 * 3600 * 1000),
        status: "OPEN",
      },
    });
    await audit(user, "SurveyCycle", cycleName, "CREATE");
    revalidatePath("/surveys");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Name the survey (3+ characters)" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function closeSurveyCycle(cycleId: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "surveys.manage");
    await db.surveyCycle.update({ where: { id: cycleId }, data: { status: "CLOSED" } });
    await audit(user, "SurveyCycle", cycleId, "CLOSE");
    revalidatePath("/surveys");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
