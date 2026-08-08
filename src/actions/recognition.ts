"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_, AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

const POINT_OPTIONS = [5, 10, 15, 20, 25];

const CORE_VALUE_ICONS = [
  "compass",
  "rocket",
  "handshake",
  "users",
  "heart-handshake",
  "mountain",
  "star",
  "shield",
] as const;

const giveSchema = z.object({
  recipientIds: z
    .array(z.string().min(1))
    .min(1, "Pick at least one recipient")
    .max(10, "You can recognize at most 10 people at once"),
  points: z.number().refine((p) => POINT_OPTIONS.includes(p), "Invalid points value"),
  message: z.string().trim().min(1, "Write a message").max(500, "Message is too long (500 max)"),
  coreValueId: z.string().min(1).optional(),
});

export async function giveRecognition(
  input: z.infer<typeof giveSchema>,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const data = giveSchema.parse(input);
    const recipientIds = [...new Set(data.recipientIds)];
    if (recipientIds.includes(user.employeeId)) {
      return { ok: false, error: "You can't recognize yourself" };
    }
    if (data.coreValueId) {
      const value = await db.coreValue.findUnique({ where: { id: data.coreValueId } });
      if (!value) return { ok: false, error: "That core value no longer exists" };
    }
    const recognition = await db.recognition.create({
      data: {
        giverId: user.employeeId,
        message: data.message,
        points: data.points,
        coreValueId: data.coreValueId ?? null,
        recipients: {
          createMany: { data: recipientIds.map((employeeId) => ({ employeeId })) },
        },
      },
    });
    const body = data.message.slice(0, 80);
    for (const employeeId of recipientIds) {
      const u = await db.user.findUnique({ where: { employeeId } });
      if (u) {
        await db.notification.create({
          data: { userId: u.id, title: "You got recognized!", body, href: "/recognition" },
        });
      }
    }
    await audit(user, "Recognition", recognition.id, "CREATE", {
      points: data.points,
      recipients: recipientIds.length,
    });
    revalidatePath("/recognition");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

const coreValueSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name is too long"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(300, "Description is too long"),
  icon: z.enum(CORE_VALUE_ICONS),
});

export async function addCoreValue(
  input: z.infer<typeof coreValueSchema>,
): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "settings.manage");
    const data = coreValueSchema.parse(input);
    const existing = await db.coreValue.findUnique({ where: { name: data.name } });
    if (existing) return { ok: false, error: "A core value with that name already exists" };
    const value = await db.coreValue.create({ data });
    await audit(user, "CoreValue", value.id, "CREATE", { name: data.name, icon: data.icon });
    revalidatePath("/recognition");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function deleteCoreValue(id: string): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "settings.manage");
    const value = await db.coreValue.findUnique({ where: { id } });
    if (!value) return { ok: false, error: "Core value not found" };
    await db.coreValue.delete({ where: { id } });
    await audit(user, "CoreValue", id, "DELETE", { name: value.name });
    revalidatePath("/recognition");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
