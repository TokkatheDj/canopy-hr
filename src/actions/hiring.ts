"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_ } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

// ── Public: apply from the careers page (no auth) ───────────────

const applySchema = z.object({
  openingId: z.string(),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  coverLetter: z.string().max(4000).optional(),
});

const RESUME_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_RESUME_BYTES = 4 * 1024 * 1024;

export async function applyToJob(formData: FormData): Promise<ActionResult> {
  try {
    const data = applySchema.parse({
      openingId: formData.get("openingId"),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone") || undefined,
      coverLetter: formData.get("coverLetter") || undefined,
    });
    const opening = await db.jobOpening.findUnique({
      where: { id: data.openingId },
      include: { stages: { orderBy: { order: "asc" }, take: 1 } },
    });
    if (!opening || !opening.isPublic || opening.closedAt) {
      return { ok: false, error: "This opening is no longer accepting applications" };
    }
    const firstStage = opening.stages[0];
    if (!firstStage) return { ok: false, error: "Opening is misconfigured" };

    const resume = formData.get("resume");
    let resumeFields: {
      resumeName: string;
      resumeType: string;
      resumeData: Uint8Array<ArrayBuffer>;
    } | null = null;
    if (resume instanceof File && resume.size > 0) {
      if (resume.size > MAX_RESUME_BYTES) {
        return { ok: false, error: "Resume must be 4 MB or smaller" };
      }
      if (!RESUME_MIME_TYPES.includes(resume.type)) {
        return { ok: false, error: "Resume must be a PDF or Word document" };
      }
      resumeFields = {
        resumeName: resume.name.slice(0, 120),
        resumeType: resume.type,
        resumeData: new Uint8Array(await resume.arrayBuffer()),
      };
    }

    const candidate = await db.candidate.create({
      data: {
        openingId: opening.id,
        stageId: firstStage.id,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.toLowerCase().trim(),
        phone: data.phone?.trim() || null,
        coverLetter: data.coverLetter?.trim() || null,
        ...(resumeFields ?? {}),
        events: {
          create: {
            kind: "APPLIED",
            body: `Applied to ${opening.title} via the careers page`,
          },
        },
      },
    });
    await audit(null, "Candidate", candidate.id, "APPLIED", {
      opening: opening.title,
    });
    revalidatePath("/hiring");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

// ── Admin: pipeline management ──────────────────────────────────

export async function moveCandidate(
  candidateId: string,
  stageId: string,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "hiring.manage");
    const candidate = await db.candidate.findUniqueOrThrow({
      where: { id: candidateId },
      include: { stage: true },
    });
    const stage = await db.pipelineStage.findUniqueOrThrow({ where: { id: stageId } });
    if (stage.openingId !== candidate.openingId) {
      return { ok: false, error: "Stage belongs to a different opening" };
    }
    if (stage.id === candidate.stageId) return { ok: true };
    await db.candidate.update({
      where: { id: candidateId },
      data: {
        stageId,
        events: {
          create: {
            kind: "STAGE_CHANGE",
            body: `Moved from ${candidate.stage.name} to ${stage.name}`,
            actorName: user.name,
          },
        },
      },
    });
    revalidatePath(`/hiring/${candidate.openingId}`);
    revalidatePath(`/hiring/candidates/${candidateId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function addCandidateNote(
  candidateId: string,
  body: string,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "hiring.manage");
    const text = z.string().min(1).max(2000).parse(body.trim());
    await db.candidateEvent.create({
      data: { candidateId, kind: "NOTE", body: text, actorName: user.name },
    });
    revalidatePath(`/hiring/candidates/${candidateId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function rejectCandidate(candidateId: string): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "hiring.manage");
    await db.candidate.update({
      where: { id: candidateId },
      data: {
        rejectedAt: new Date(),
        events: {
          create: { kind: "REJECTED", body: "Marked as not moving forward", actorName: user.name },
        },
      },
    });
    const c = await db.candidate.findUniqueOrThrow({ where: { id: candidateId } });
    revalidatePath(`/hiring/${c.openingId}`);
    revalidatePath(`/hiring/candidates/${candidateId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

const offerSchema = z.object({
  candidateId: z.string(),
  title: z.string().min(1).max(80),
  payType: z.enum(["SALARY", "HOURLY"]),
  amountDollars: z.coerce.number().positive(),
  startDate: z.string(),
});

export async function sendOffer(input: z.infer<typeof offerSchema>): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "hiring.manage");
    const data = offerSchema.parse(input);
    const candidate = await db.candidate.findUniqueOrThrow({
      where: { id: data.candidateId },
      include: { opening: true },
    });
    const start = new Date(data.startDate + "T00:00:00Z");
    const salaryCents = Math.round(data.amountDollars * 100);
    const body =
      `Dear ${candidate.firstName},\n\n` +
      `We're delighted to offer you the position of ${data.title} at Meridian Coffee Co. ` +
      `Your ${data.payType === "SALARY" ? "annual salary" : "hourly rate"} will be ` +
      `$${data.amountDollars.toLocaleString("en-US")}${data.payType === "HOURLY" ? "/hour" : ""}, ` +
      `with a start date of ${start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.\n\n` +
      `This offer includes our full benefits package: medical, dental, and vision coverage, ` +
      `a 401(k) with company match, and our time-off policies.\n\n` +
      `We can't wait to have you on the team.\n\nWarmly,\nThe Meridian Coffee Co. People Team`;

    const offer = await db.offerLetter.upsert({
      where: { candidateId: data.candidateId },
      create: {
        candidateId: data.candidateId,
        title: data.title,
        payType: data.payType,
        salaryCents,
        startDate: start,
        body,
        signToken: randomBytes(24).toString("base64url"),
      },
      update: { title: data.title, payType: data.payType, salaryCents, startDate: start, body },
    });
    // offers created before e-sign existed have no token yet
    if (!offer.signToken) {
      await db.offerLetter.update({
        where: { id: offer.id },
        data: { signToken: randomBytes(24).toString("base64url") },
      });
    }
    await db.candidateEvent.create({
      data: {
        candidateId: data.candidateId,
        kind: "OFFER_SENT",
        body: `Offer sent: ${data.title}`,
        actorName: user.name,
      },
    });
    revalidatePath(`/hiring/candidates/${data.candidateId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

// ── Public: candidate signs their offer letter (no auth; token is the secret) ──

export async function signOffer(token: string, name: string): Promise<ActionResult> {
  try {
    const signedName = z.string().min(2).max(100).parse(name.trim());
    const offer = await db.offerLetter.findUnique({
      where: { signToken: z.string().min(10).parse(token) },
      include: { candidate: true },
    });
    if (!offer) return { ok: false, error: "This offer link is no longer valid" };
    if (offer.signedAt) return { ok: false, error: "This offer has already been signed" };

    const now = new Date();
    await db.offerLetter.update({
      where: { id: offer.id },
      data: { signedName, signedAt: now, acceptedAt: offer.acceptedAt ?? now },
    });
    await db.candidateEvent.create({
      data: {
        candidateId: offer.candidateId,
        kind: "OFFER_SIGNED",
        body: `Offer signed by ${signedName}`,
        actorName: `${offer.candidate.firstName} ${offer.candidate.lastName}`,
      },
    });
    const admins = await db.user.findMany({ where: { role: "ADMIN" } });
    if (admins.length > 0) {
      await db.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          title: "Offer signed",
          body: `${offer.candidate.firstName} ${offer.candidate.lastName} signed their offer`,
          href: `/hiring/candidates/${offer.candidateId}`,
        })),
      });
    }
    await audit(null, "OfferLetter", offer.id, "SIGNED", { signedName });
    revalidatePath(`/hiring/candidates/${offer.candidateId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export type MarkHiredResult =
  | { ok: true; login: { email: string; tempPassword: string } | null }
  | { ok: false; error: string };

/**
 * Converts an offer-holding candidate into an Employee: creates the employee
 * record with effective-dated job/comp rows, assigns time-off policies,
 * creates their login, and spins up the onboarding checklist.
 */
export async function markHired(candidateId: string): Promise<MarkHiredResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "hiring.manage");
    const candidate = await db.candidate.findUniqueOrThrow({
      where: { id: candidateId },
      include: { offer: true, opening: true },
    });
    if (!candidate.offer) return { ok: false, error: "Send an offer before marking hired" };
    if (candidate.hiredEmployeeId) return { ok: false, error: "Already hired" };

    const offer = candidate.offer;
    const dept = await db.department.findFirst({
      where: { name: candidate.opening.departmentName },
    });
    const loc = await db.location.findFirst({
      where: { name: candidate.opening.locationName },
    });

    const employee = await db.employee.create({
      data: {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        workEmail: `${candidate.firstName.toLowerCase()}.${candidate.lastName.toLowerCase()}@meridiancoffee.demo`,
        personalEmail: candidate.email,
        phone: candidate.phone,
        photoUrl: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(`${candidate.firstName}-${candidate.lastName}`)}&backgroundColor=d1fae5`,
        hireDate: offer.startDate,
        status: "ONBOARDING",
        departmentId: dept?.id,
        locationId: loc?.id,
        jobInfos: {
          create: {
            effectiveDate: offer.startDate,
            title: offer.title,
            departmentName: candidate.opening.departmentName,
            locationName: candidate.opening.locationName,
            employmentType: candidate.opening.employmentType,
            changeReason: "Hire",
          },
        },
        compensations: {
          create: {
            effectiveDate: offer.startDate,
            payType: offer.payType,
            amountCents: offer.salaryCents,
            changeReason: "Hire",
          },
        },
      },
    });

    // login account so the new hire can sign in and complete onboarding
    let login: { email: string; tempPassword: string } | null = null;
    const existingUser = await db.user.findUnique({ where: { email: employee.workEmail } });
    if (!existingUser) {
      const tempPassword = `canopy-${randomBytes(4).toString("hex")}`;
      await db.user.create({
        data: {
          email: employee.workEmail,
          passwordHash: await bcrypt.hash(tempPassword, 10),
          role: "EMPLOYEE",
          employeeId: employee.id,
        },
      });
      login = { email: employee.workEmail, tempPassword };
    }

    // assign all time-off policies
    const policies = await db.timeOffPolicy.findMany();
    for (const p of policies) {
      await db.policyAssignment.create({
        data: { employeeId: employee.id, policyId: p.id, startDate: offer.startDate },
      });
    }

    // onboarding checklist from template
    const template = await db.checklistTemplate.findFirst({
      where: { kind: "ONBOARDING" },
      include: { tasks: { orderBy: { order: "asc" } } },
    });
    if (template) {
      await db.checklistInstance.create({
        data: {
          templateId: template.id,
          employeeId: employee.id,
          kind: "ONBOARDING",
          tasks: {
            create: template.tasks.map((t) => ({
              title: t.title,
              assigneeRole: t.assigneeRole,
              order: t.order,
              dueDate: new Date(
                offer.startDate.getTime() + t.dueOffsetDays * 24 * 3600 * 1000,
              ),
            })),
          },
        },
      });
    }

    await db.candidate.update({
      where: { id: candidateId },
      data: {
        hiredEmployeeId: employee.id,
        offer: { update: { acceptedAt: offer.acceptedAt ?? new Date() } },
        events: {
          create: {
            kind: "HIRED",
            body: `Hired — employee record created, onboarding started`,
            actorName: user.name,
          },
        },
      },
    });

    await audit(user, "Employee", employee.id, "CREATE", {
      via: "hired candidate",
      title: offer.title,
    });
    revalidatePath("/hiring");
    revalidatePath("/onboarding");
    revalidatePath("/people");
    return { ok: true, login };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
