"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_, AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";
import type { Prisma } from "@/generated/prisma/client";

const DEFAULT_QUESTIONS = [
  { id: "q1", prompt: "What went well this cycle?", type: "text" },
  { id: "q2", prompt: "What could have gone better?", type: "text" },
  { id: "q3", prompt: "Overall performance", type: "rating" },
  { id: "q4", prompt: "Growth & development", type: "rating" },
] as const;

// ── Review cycles (admin) ───────────────────────────────────────

export async function createReviewCycle(name: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "performance.manage");
    const cycleName = z.string().min(3).max(80).parse(name.trim());
    const now = new Date();
    const end = new Date(now.getTime() + 21 * 24 * 3600 * 1000);

    const cycle = await db.reviewCycle.create({
      data: {
        name: cycleName,
        startDate: now,
        endDate: end,
        status: "OPEN",
        questions: DEFAULT_QUESTIONS as unknown as Prisma.InputJsonValue,
      },
    });

    // Generate SELF + MANAGER assessments for every active employee
    const employees = await db.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, managerId: true },
    });
    for (const emp of employees) {
      await db.assessment.create({
        data: { cycleId: cycle.id, subjectId: emp.id, authorId: emp.id, kind: "SELF" },
      });
      if (emp.managerId) {
        await db.assessment.create({
          data: {
            cycleId: cycle.id,
            subjectId: emp.id,
            authorId: emp.managerId,
            kind: "MANAGER",
          },
        });
      }
    }
    await audit(user, "ReviewCycle", cycle.id, "CREATE", { name: cycleName });
    revalidatePath("/performance");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Name the cycle (3+ characters)" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function closeReviewCycle(cycleId: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "performance.manage");
    await db.reviewCycle.update({
      where: { id: cycleId },
      data: { status: "CLOSED" },
    });
    await audit(user, "ReviewCycle", cycleId, "CLOSE");
    revalidatePath("/performance");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

// ── Assessments ─────────────────────────────────────────────────

const answersSchema = z.record(z.string(), z.union([z.string().max(4000), z.number().min(1).max(5)]));

export async function saveAssessment(
  assessmentId: string,
  answers: Record<string, string | number>,
  submit: boolean,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const assessment = await db.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      include: { cycle: true },
    });
    if (assessment.authorId !== user.employeeId) {
      throw new AuthzError("not your assessment");
    }
    if (assessment.cycle.status !== "OPEN") {
      return { ok: false, error: "This cycle is closed" };
    }
    if (assessment.status === "SUBMITTED") {
      return { ok: false, error: "Already submitted" };
    }
    const parsed = answersSchema.parse(answers);
    await db.assessment.update({
      where: { id: assessmentId },
      data: {
        answers: parsed as Prisma.InputJsonValue,
        status: submit ? "SUBMITTED" : "IN_PROGRESS",
        submittedAt: submit ? new Date() : null,
      },
    });
    revalidatePath("/performance");
    revalidatePath(`/performance/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function givePeerFeedback(
  cycleId: string,
  subjectId: string,
): Promise<ActionResult & { assessmentId?: string }> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    if (subjectId === user.employeeId) {
      return { ok: false, error: "Pick a colleague, not yourself" };
    }
    const cycle = await db.reviewCycle.findUniqueOrThrow({ where: { id: cycleId } });
    if (cycle.status !== "OPEN") return { ok: false, error: "Cycle is closed" };
    const assessment = await db.assessment.upsert({
      where: {
        cycleId_subjectId_authorId_kind: {
          cycleId,
          subjectId,
          authorId: user.employeeId,
          kind: "PEER",
        },
      },
      create: { cycleId, subjectId, authorId: user.employeeId, kind: "PEER" },
      update: {},
    });
    return { ok: true, assessmentId: assessment.id };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

// ── Goals ───────────────────────────────────────────────────────

const goalSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(1000).optional(),
  dueDate: z.string().optional(),
});

export async function createGoal(input: z.infer<typeof goalSchema>): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const data = goalSchema.parse(input);
    await db.goal.create({
      data: {
        employeeId: user.employeeId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        dueDate: data.dueDate ? new Date(data.dueDate + "T00:00:00Z") : null,
      },
    });
    revalidatePath("/performance");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

const checkinSchema = z.object({
  goalId: z.string(),
  progressPct: z.coerce.number().min(0).max(100),
  body: z.string().min(1).max(1000),
  status: z.enum(["ON_TRACK", "AT_RISK", "BEHIND", "COMPLETED"]),
});

export async function checkinGoal(input: z.infer<typeof checkinSchema>): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const data = checkinSchema.parse(input);
    const goal = await db.goal.findUniqueOrThrow({ where: { id: data.goalId } });
    if (goal.employeeId !== user.employeeId && user.role !== "ADMIN") {
      throw new AuthzError("not your goal");
    }
    await db.goal.update({
      where: { id: data.goalId },
      data: {
        progressPct: data.progressPct,
        status: data.status,
        checkins: {
          create: { body: data.body.trim(), progressPct: data.progressPct },
        },
      },
    });
    revalidatePath("/performance");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

// ── 1:1s ────────────────────────────────────────────────────────

const oneOnOneSchema = z.object({
  participantBId: z.string(),
  date: z.string(),
  sharedNotes: z.string().max(4000).optional(),
});

export async function createOneOnOne(
  input: z.infer<typeof oneOnOneSchema>,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const data = oneOnOneSchema.parse(input);
    await db.oneOnOne.create({
      data: {
        participantAId: user.employeeId,
        participantBId: data.participantBId,
        date: new Date(data.date + "T00:00:00Z"),
        sharedNotes: data.sharedNotes?.trim() || null,
      },
    });
    revalidatePath("/performance");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
