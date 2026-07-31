"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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

export async function applyToJob(
  input: z.infer<typeof applySchema>,
): Promise<ActionResult> {
  try {
    const data = applySchema.parse(input);
    const opening = await db.jobOpening.findUnique({
      where: { id: data.openingId },
      include: { stages: { orderBy: { order: "asc" }, take: 1 } },
    });
    if (!opening || !opening.isPublic || opening.closedAt) {
      return { ok: false, error: "This opening is no longer accepting applications" };
    }
    const firstStage = opening.stages[0];
    if (!firstStage) return { ok: false, error: "Opening is misconfigured" };

    const candidate = await db.candidate.create({
      data: {
        openingId: opening.id,
        stageId: firstStage.id,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.toLowerCase().trim(),
        phone: data.phone?.trim() || null,
        coverLetter: data.coverLetter?.trim() || null,
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

    await db.offerLetter.upsert({
      where: { candidateId: data.candidateId },
      create: {
        candidateId: data.candidateId,
        title: data.title,
        payType: data.payType,
        salaryCents,
        startDate: start,
        body,
      },
      update: { title: data.title, payType: data.payType, salaryCents, startDate: start, body },
    });
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

/**
 * Converts an offer-holding candidate into an Employee: creates the employee
 * record with effective-dated job/comp rows, assigns time-off policies, and
 * spins up the onboarding checklist.
 */
export async function markHired(candidateId: string): Promise<ActionResult> {
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
        offer: { update: { acceptedAt: new Date() } },
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
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
