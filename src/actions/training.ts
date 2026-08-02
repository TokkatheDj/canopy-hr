"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_, AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

function fail(e: unknown): ActionResult {
  if (e instanceof AuthzError) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) {
    return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  }
  console.error(e);
  return { ok: false, error: "Something went wrong" };
}

export async function createTrainingCategory(name: string): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "settings.manage");
    const parsed = z.string().trim().min(1, "Name is required").max(80).parse(name);
    const existing = await db.trainingCategory.findUnique({ where: { name: parsed } });
    if (existing) return { ok: false, error: "A category with that name already exists" };
    const max = await db.trainingCategory.aggregate({ _max: { order: true } });
    const category = await db.trainingCategory.create({
      data: { name: parsed, order: (max._max.order ?? 0) + 1 },
    });
    await audit(user, "TrainingCategory", category.id, "CREATE", { name: parsed });
    revalidatePath("/training");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTrainingCategory(id: string): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "settings.manage");
    // courses in this category become uncategorized (categoryId SET NULL)
    const category = await db.trainingCategory.delete({ where: { id } });
    await audit(user, "TrainingCategory", id, "DELETE", { name: category.name });
    revalidatePath("/training");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const courseSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  categoryId: z.string().optional(),
  required: z.boolean(),
  frequencyMonths: z.number().int().positive().nullable().optional(),
  dueDaysFromHire: z.number().int().positive().nullable().optional(),
});

export async function createTrainingCourse(
  input: z.infer<typeof courseSchema>,
): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "settings.manage");
    const data = courseSchema.parse(input);
    const existing = await db.trainingCourse.findUnique({ where: { name: data.name } });
    if (existing) return { ok: false, error: "A course with that name already exists" };
    const course = await db.trainingCourse.create({
      data: {
        name: data.name,
        categoryId: data.categoryId || null,
        required: data.required,
        frequencyMonths: data.frequencyMonths ?? null,
        dueDaysFromHire: data.dueDaysFromHire ?? null,
      },
    });
    await audit(user, "TrainingCourse", course.id, "CREATE", { name: data.name });
    revalidatePath("/training");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTrainingCourse(id: string): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "settings.manage");
    const course = await db.trainingCourse.delete({ where: { id } });
    await audit(user, "TrainingCourse", id, "DELETE", { name: course.name });
    revalidatePath("/training");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markTrainingComplete(
  courseId: string,
  employeeId?: string,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user) throw new AuthzError("not signed in");
    const targetId = employeeId ?? user.employeeId;
    if (!targetId) return { ok: false, error: "No employee record linked to your account" };
    if (targetId !== user.employeeId) require_(user, "settings.manage");
    const course = await db.trainingCourse.findUnique({ where: { id: courseId } });
    if (!course) return { ok: false, error: "Course not found" };
    const record = await db.trainingRecord.create({
      data: { courseId, employeeId: targetId, completedAt: new Date() },
    });
    await audit(user, "TrainingRecord", record.id, "COMPLETE", {
      courseName: course.name,
      employeeId: targetId,
    });
    revalidatePath("/training");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
