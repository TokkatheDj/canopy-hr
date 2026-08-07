"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_, AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import {
  createApproval,
  SELF_EDITABLE_FIELDS,
  type InfoChangePayload,
} from "@/lib/approvals";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  if (e instanceof AuthzError) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  console.error(e);
  return { ok: false, error: "Something went wrong" };
}

// ── Admin: direct edits ─────────────────────────────────────────

const personalSchema = z.object({
  employeeId: z.string(),
  preferredName: z.string().max(60).optional(),
  personalEmail: z.string().email().or(z.literal("")).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(120).optional(),
  city: z.string().max(60).optional(),
  state: z.string().max(30).optional(),
  zip: z.string().max(12).optional(),
});

export async function adminUpdatePersonal(
  input: z.infer<typeof personalSchema>,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "people.edit");
    const { employeeId, ...fields } = personalSchema.parse(input);
    const before = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
    await db.employee.update({ where: { id: employeeId }, data: fields });
    const diff: Record<string, { from: string; to: string }> = {};
    for (const [k, v] of Object.entries(fields)) {
      const prev = (before as Record<string, unknown>)[k];
      if (prev !== v) diff[k] = { from: String(prev ?? ""), to: String(v ?? "") };
    }
    await audit(user, "Employee", employeeId, "UPDATE", diff);
    revalidatePath(`/people/${employeeId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const jobChangeSchema = z.object({
  employeeId: z.string(),
  effectiveDate: z.string(), // yyyy-mm-dd
  title: z.string().min(1).max(80),
  departmentName: z.string().min(1),
  locationName: z.string().min(1),
  employmentType: z.string().min(1),
  changeReason: z.string().min(1),
});

export async function adminAddJobChange(
  input: z.infer<typeof jobChangeSchema>,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "people.edit");
    const data = jobChangeSchema.parse(input);
    const effectiveDate = new Date(data.effectiveDate + "T00:00:00Z");

    // Resolve the names BEFORE writing anything. Prisma silently omits a field
    // whose value is `undefined`, so an unrecognised name used to leave
    // JobInfo.departmentName and Employee.departmentId disagreeing forever,
    // with no error raised anywhere. Fail loudly instead.
    const [dept, loc] = await Promise.all([
      db.department.findUnique({ where: { name: data.departmentName } }),
      db.location.findUnique({ where: { name: data.locationName } }),
    ]);
    if (!dept) return { ok: false, error: `Unknown department: ${data.departmentName}` };
    if (!loc) return { ok: false, error: `Unknown location: ${data.locationName}` };

    const created = await db.jobInfo.create({ data: { ...data, effectiveDate } });

    // The denormalized refs on Employee describe the job in force TODAY, so
    // sync them only when this record is the one in force. Previously any job
    // change rewrote them immediately: a transfer dated next month moved the
    // person early (directory said one thing, Job tab another), and a
    // back-dated correction overwrote current data with historical values.
    const now = new Date();
    const supersededByLaterChange = await db.jobInfo.findFirst({
      where: {
        employeeId: data.employeeId,
        id: { not: created.id },
        effectiveDate: { gt: effectiveDate, lte: now },
      },
      select: { id: true },
    });
    const inForceNow = effectiveDate <= now && !supersededByLaterChange;

    if (inForceNow) {
      await db.employee.update({
        where: { id: data.employeeId },
        data: { departmentId: dept.id, locationId: loc.id },
      });
    }

    await audit(user, "Employee", data.employeeId, "JOB_CHANGE", {
      title: data.title,
      effectiveDate: data.effectiveDate,
      reason: data.changeReason,
      // Recorded because "why didn't the directory change?" is otherwise
      // indistinguishable from a bug.
      appliedToProfileNow: inForceNow,
    });
    revalidatePath(`/people/${data.employeeId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const compChangeSchema = z.object({
  employeeId: z.string(),
  effectiveDate: z.string(),
  payType: z.enum(["HOURLY", "SALARY"]),
  amountDollars: z.coerce.number().positive(),
  changeReason: z.string().min(1),
});

export async function adminAddCompChange(
  input: z.infer<typeof compChangeSchema>,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "people.edit");
    const data = compChangeSchema.parse(input);
    await db.compensation.create({
      data: {
        employeeId: data.employeeId,
        effectiveDate: new Date(data.effectiveDate + "T00:00:00Z"),
        payType: data.payType,
        amountCents: Math.round(data.amountDollars * 100),
        changeReason: data.changeReason,
      },
    });
    await audit(user, "Employee", data.employeeId, "COMP_CHANGE", {
      effectiveDate: data.effectiveDate,
      reason: data.changeReason,
    });
    revalidatePath(`/people/${data.employeeId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Self-service: request an info change (routes through approvals) ──

const selfEditSchema = z.object({
  preferredName: z.string().max(60).optional(),
  personalEmail: z.string().email().or(z.literal("")).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(120).optional(),
  city: z.string().max(60).optional(),
  state: z.string().max(30).optional(),
  zip: z.string().max(12).optional(),
});

const FIELD_LABELS: Record<string, string> = {
  preferredName: "Preferred name",
  personalEmail: "Personal email",
  phone: "Phone",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
};

export async function requestInfoChange(
  input: z.infer<typeof selfEditSchema>,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const fields = selfEditSchema.parse(input);
    const before = await db.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
    });

    const changes: InfoChangePayload["changes"] = [];
    for (const field of SELF_EDITABLE_FIELDS) {
      const next = fields[field];
      if (next === undefined) continue;
      const prev = (before as Record<string, unknown>)[field] ?? "";
      if (String(prev) !== next) {
        changes.push({
          field,
          label: FIELD_LABELS[field] ?? field,
          oldValue: String(prev),
          newValue: next,
        });
      }
    }
    if (changes.length === 0) return { ok: false, error: "No changes to submit" };

    await createApproval({
      type: "INFO_CHANGE",
      requester: { employeeId: user.employeeId, name: user.name },
      summary: `Info change: ${changes.map((c) => c.label).join(", ")}`,
      payload: { employeeId: user.employeeId, changes },
    });
    revalidatePath("/my-info");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Notes, emergency contacts, custom fields ────────────────────

export async function addNote(employeeId: string, body: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "people.edit");
    const text = z.string().min(1).max(2000).parse(body.trim());
    await db.note.create({
      data: { employeeId, authorName: user.name, body: text },
    });
    await audit(user, "Employee", employeeId, "NOTE_ADDED");
    revalidatePath(`/people/${employeeId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const contactSchema = z.object({
  employeeId: z.string(),
  name: z.string().min(1).max(80),
  relationship: z.string().min(1).max(40),
  phone: z.string().min(3).max(30),
});

export async function addEmergencyContact(
  input: z.infer<typeof contactSchema>,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user) throw new AuthzError("signed out");
    const data = contactSchema.parse(input);
    // Employees may edit their own; admins anyone's.
    if (user.role !== "ADMIN" && user.employeeId !== data.employeeId) {
      throw new AuthzError("emergency contact");
    }
    await db.emergencyContact.create({ data });
    await audit(user, "Employee", data.employeeId, "EMERGENCY_CONTACT_ADDED");
    revalidatePath(`/people/${data.employeeId}`);
    revalidatePath("/my-info");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCustomFieldValue(
  employeeId: string,
  definitionId: string,
  value: string,
): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user) throw new AuthzError("signed out");
    if (user.role !== "ADMIN" && user.employeeId !== employeeId) {
      throw new AuthzError("custom field");
    }

    // None of this was checked before. Server Actions are public HTTP
    // endpoints, so "the UI only sends valid values" is not a constraint:
    // any authenticated user could write an unbounded string against any
    // definition id, including one belonging to a different entity, and
    // bypass a SELECT's option list entirely.
    const def = await db.customFieldDefinition.findUnique({
      where: { id: definitionId },
    });
    if (!def || def.entity !== "EMPLOYEE") return { ok: false, error: "Unknown field" };

    const exists = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!exists) return { ok: false, error: "Unknown employee" };

    const clean = value.trim();
    switch (def.type) {
      case "SELECT": {
        const options = (def.options as string[] | null) ?? [];
        if (clean !== "" && !options.includes(clean)) {
          return { ok: false, error: `${def.label} must be one of: ${options.join(", ")}` };
        }
        break;
      }
      case "NUMBER":
        if (clean !== "" && !Number.isFinite(Number(clean))) {
          return { ok: false, error: `${def.label} must be a number` };
        }
        break;
      case "DATE":
        if (clean !== "" && Number.isNaN(Date.parse(clean))) {
          return { ok: false, error: `${def.label} must be a valid date` };
        }
        break;
      case "CHECKBOX":
        if (clean !== "true" && clean !== "false") {
          return { ok: false, error: `${def.label} must be true or false` };
        }
        break;
      case "TEXT":
        if (clean.length > 500) {
          return { ok: false, error: `${def.label} must be 500 characters or fewer` };
        }
        break;
    }

    await db.customFieldValue.upsert({
      where: { definitionId_employeeId: { definitionId, employeeId } },
      create: { definitionId, employeeId, value: clean },
      update: { value: clean },
    });
    // This was the only mutating action in the file that recorded nothing —
    // custom fields can hold anything HR chooses to put in them, so an
    // unlogged write here is exactly the one you would want to look up later.
    await audit(user, "Employee", employeeId, "CUSTOM_FIELD_SET", {
      field: def.label,
      value: clean,
    });
    revalidatePath(`/people/${employeeId}`);
    revalidatePath("/my-info");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
