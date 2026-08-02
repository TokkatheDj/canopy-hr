"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
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

// ── Admin: add an employee directly (no hiring pipeline) ────────

const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  workEmail: z.string().email(),
  personalEmail: z.string().email().or(z.literal("")).optional(),
  phone: z.string().max(30).optional(),
  hireDate: z.string(), // yyyy-mm-dd
  title: z.string().min(1).max(80),
  departmentName: z.string().min(1),
  locationName: z.string().min(1),
  employmentType: z.string().min(1),
  payType: z.enum(["HOURLY", "SALARY"]),
  amountDollars: z.coerce.number().positive(),
  managerId: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
});

export type CreateEmployeeResult =
  | { ok: true; employeeId: string; login: { email: string; tempPassword: string } }
  | { ok: false; error: string };

export async function createEmployee(
  input: z.infer<typeof createEmployeeSchema>,
): Promise<CreateEmployeeResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "people.edit");
    const data = createEmployeeSchema.parse(input);
    const email = data.workEmail.toLowerCase().trim();

    if (await db.employee.findUnique({ where: { workEmail: email } })) {
      return { ok: false, error: "An employee with that work email already exists" };
    }
    if (await db.user.findUnique({ where: { email } })) {
      return { ok: false, error: "A login with that email already exists" };
    }

    const hireDate = new Date(data.hireDate + "T00:00:00Z");
    const dept = await db.department.findUnique({ where: { name: data.departmentName } });
    const loc = await db.location.findUnique({ where: { name: data.locationName } });

    const employee = await db.employee.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        workEmail: email,
        personalEmail: data.personalEmail?.trim() || null,
        phone: data.phone?.trim() || null,
        photoUrl: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(`${data.firstName}-${data.lastName}`)}&backgroundColor=d1fae5`,
        hireDate,
        status: "ACTIVE",
        managerId: data.managerId || null,
        departmentId: dept?.id,
        locationId: loc?.id,
        jobInfos: {
          create: {
            effectiveDate: hireDate,
            title: data.title,
            departmentName: data.departmentName,
            locationName: data.locationName,
            employmentType: data.employmentType,
            changeReason: "Hire",
          },
        },
        compensations: {
          create: {
            effectiveDate: hireDate,
            payType: data.payType,
            amountCents: Math.round(data.amountDollars * 100),
            changeReason: "Hire",
          },
        },
      },
    });

    const tempPassword = `canopy-${randomBytes(4).toString("hex")}`;
    await db.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        role: data.role,
        employeeId: employee.id,
      },
    });

    const policies = await db.timeOffPolicy.findMany();
    for (const p of policies) {
      await db.policyAssignment.create({
        data: { employeeId: employee.id, policyId: p.id, startDate: hireDate },
      });
    }

    await audit(user, "Employee", employee.id, "CREATE", {
      via: "manual add",
      title: data.title,
    });
    revalidatePath("/people");
    return { ok: true, employeeId: employee.id, login: { email, tempPassword } };
  } catch (e) {
    const r = fail(e);
    return r.ok ? { ok: false, error: "Something went wrong" } : r;
  }
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
    await db.jobInfo.create({
      data: { ...data, effectiveDate: new Date(data.effectiveDate + "T00:00:00Z") },
    });
    // keep denormalized department/location refs in sync when effective now
    const dept = await db.department.findUnique({ where: { name: data.departmentName } });
    const loc = await db.location.findUnique({ where: { name: data.locationName } });
    await db.employee.update({
      where: { id: data.employeeId },
      data: { departmentId: dept?.id, locationId: loc?.id },
    });
    await audit(user, "Employee", data.employeeId, "JOB_CHANGE", {
      title: data.title,
      effectiveDate: data.effectiveDate,
      reason: data.changeReason,
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
    await db.customFieldValue.upsert({
      where: { definitionId_employeeId: { definitionId, employeeId } },
      create: { definitionId, employeeId, value },
      update: { value },
    });
    revalidatePath(`/people/${employeeId}`);
    revalidatePath("/my-info");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
