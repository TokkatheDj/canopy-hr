"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_ } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

const companySchema = z.object({
  companyName: z.string().min(1).max(120),
  ein: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  managersSeeCompensation: z.boolean(),
});

export async function updateCompanySettings(
  input: z.infer<typeof companySchema>,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "settings.manage");
    const data = companySchema.parse(input);
    await db.companySettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        companyName: data.companyName,
        ein: data.ein || null,
        address: data.address || null,
        flags: { managersSeeCompensation: data.managersSeeCompensation },
      },
      update: {
        companyName: data.companyName,
        ein: data.ein || null,
        address: data.address || null,
        flags: { managersSeeCompensation: data.managersSeeCompensation },
      },
    });
    await audit(user, "CompanySettings", "singleton", "UPDATE");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

const fieldSchema = z.object({
  label: z.string().min(1).max(60),
  type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX"]),
  options: z.array(z.string().min(1).max(60)).optional(),
});

export async function addCustomField(
  input: z.infer<typeof fieldSchema>,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "settings.manage");
    const data = fieldSchema.parse(input);
    if (data.type === "SELECT" && (!data.options || data.options.length < 2)) {
      return { ok: false, error: "Dropdown fields need at least two options" };
    }
    const max = await db.customFieldDefinition.aggregate({ _max: { order: true } });
    await db.customFieldDefinition.create({
      data: {
        label: data.label.trim(),
        type: data.type,
        options: data.type === "SELECT" ? data.options : undefined,
        order: (max._max.order ?? -1) + 1,
      },
    });
    await audit(user, "CustomFieldDefinition", data.label, "CREATE");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { ok: false, error: "A field with that label already exists" };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function deleteCustomField(fieldId: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "settings.manage");
    await db.customFieldDefinition.delete({ where: { id: fieldId } });
    await audit(user, "CustomFieldDefinition", fieldId, "DELETE");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function addHoliday(name: string, date: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "settings.manage");
    const parsedName = z.string().min(2).max(80).parse(name.trim());
    await db.holiday.create({
      data: { name: parsedName, date: new Date(date + "T00:00:00Z") },
    });
    await audit(user, "Holiday", parsedName, "CREATE", { date });
    revalidatePath("/settings");
    revalidatePath("/time-off");
    return { ok: true };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { ok: false, error: "That holiday already exists" };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function deleteHoliday(holidayId: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "settings.manage");
    await db.holiday.delete({ where: { id: holidayId } });
    await audit(user, "Holiday", holidayId, "DELETE");
    revalidatePath("/settings");
    revalidatePath("/time-off");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

const announcementSchema = z.object({
  title: z.string().min(3).max(120),
  body: z.string().min(3).max(2000),
  pinned: z.boolean(),
});

export async function postAnnouncement(
  input: z.infer<typeof announcementSchema>,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "settings.manage");
    const data = announcementSchema.parse(input);
    await db.announcement.create({
      data: {
        title: data.title.trim(),
        body: data.body.trim(),
        pinned: data.pinned,
        authorName: user.name,
      },
    });
    await audit(user, "Announcement", data.title, "CREATE");
    revalidatePath("/home");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
