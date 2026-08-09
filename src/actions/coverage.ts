"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_, AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  startTime: z.string().trim().min(1, "Start time is required").max(20),
  endTime: z.string().trim().min(1, "End time is required").max(20),
  locationId: z.string().min(1).optional(),
  role: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500, "Notes are too long (500 max)").optional(),
  absentId: z.string().min(1).optional(),
  recipientIds: z
    .array(z.string().min(1))
    .min(1, "Pick at least one recipient")
    .max(60, "Too many recipients"),
});

function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function createCoverageBlast(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult & { id?: string }> {
  try {
    const user = require_((await currentUser()) ?? undefined, "coverage.manage");
    const data = createSchema.parse(input);
    const date = parseLocalDate(data.date);

    const recipientIds = [...new Set(data.recipientIds)].filter(
      (id) => id !== data.absentId,
    );
    const employees = await db.employee.findMany({
      where: { id: { in: recipientIds }, status: "ACTIVE" },
      select: { id: true },
    });
    if (employees.length === 0) {
      return { ok: false, error: "No active employees selected" };
    }

    const location = data.locationId
      ? await db.location.findUnique({ where: { id: data.locationId } })
      : null;
    if (data.locationId && !location) {
      return { ok: false, error: "That location no longer exists" };
    }
    const absent = data.absentId
      ? await db.employee.findUnique({ where: { id: data.absentId } })
      : null;

    const dayLabel = format(date, "EEEE, MMMM d");
    const shiftLabel = data.role ? `${data.role} shift` : "shift";
    const emailSubject = `Coverage needed: ${shiftLabel} on ${format(date, "EEE MMM d")} (${data.startTime} - ${data.endTime})`;
    const emailBody = [
      "Hi team,",
      "",
      `${absent ? `${absent.firstName} ${absent.lastName} had to call off, and we` : "We"} need someone to cover the ${shiftLabel} on ${dayLabel} from ${data.startTime} to ${data.endTime}${location ? ` at ${location.name}` : ""}.`,
      "",
      "If you can pick it up, open the Coverage page in Canopy HR and tap \"I can cover it\". First to confirm gets the shift.",
      ...(data.notes ? ["", data.notes] : []),
      "",
      "Thank you!",
      user.name,
    ].join("\n");

    const request = await db.coverageRequest.create({
      data: {
        date,
        startTime: data.startTime,
        endTime: data.endTime,
        locationId: location?.id ?? null,
        role: data.role || null,
        notes: data.notes || null,
        emailSubject,
        emailBody,
        createdById: requireEmployeeId(user),
        absentId: absent?.id ?? null,
        recipients: {
          createMany: { data: employees.map((e) => ({ employeeId: e.id })) },
        },
      },
    });

    // Simulated email delivery: each recipient with a login also gets an
    // in-app notification pointing at the Coverage page.
    const users = await db.user.findMany({
      where: { employeeId: { in: employees.map((e) => e.id) } },
      select: { id: true },
    });
    if (users.length > 0) {
      await db.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          title: "Can you cover a shift?",
          body: emailSubject,
          href: "/coverage",
        })),
      });
    }

    await audit(user, "CoverageRequest", request.id, "CREATE", {
      date: data.date,
      recipients: employees.length,
    });
    revalidatePath("/coverage");
    revalidatePath("/home");
    return { ok: true, id: request.id };
  } catch (e) {
    return fail(e);
  }
}

export async function respondToCoverage(input: {
  requestId: string;
  response: "AVAILABLE" | "DECLINED";
}): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const response = z.enum(["AVAILABLE", "DECLINED"]).parse(input.response);

    const recipient = await db.coverageRecipient.findUnique({
      where: {
        requestId_employeeId: {
          requestId: input.requestId,
          employeeId: user.employeeId,
        },
      },
      include: { request: true },
    });
    if (!recipient) return { ok: false, error: "You weren't included in this request" };
    if (recipient.request.status !== "OPEN") {
      return { ok: false, error: "This request is no longer open" };
    }

    await db.coverageRecipient.update({
      where: { id: recipient.id },
      data: { response, respondedAt: new Date() },
    });

    if (response === "AVAILABLE") {
      const creator = await db.user.findUnique({
        where: { employeeId: recipient.request.createdById },
      });
      if (creator) {
        await db.notification.create({
          data: {
            userId: creator.id,
            title: `${user.name} can cover the shift`,
            body: recipient.request.emailSubject,
            href: "/coverage",
          },
        });
      }
    }

    revalidatePath("/coverage");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function assignCoverage(input: {
  requestId: string;
  employeeId: string;
}): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "coverage.manage");
    const request = await db.coverageRequest.findUnique({
      where: { id: input.requestId },
      include: { recipients: true },
    });
    if (!request) return { ok: false, error: "Request not found" };
    if (request.status !== "OPEN") {
      return { ok: false, error: "This request is no longer open" };
    }
    const chosen = request.recipients.find((r) => r.employeeId === input.employeeId);
    if (!chosen) return { ok: false, error: "Pick one of the invited employees" };

    await db.coverageRequest.update({
      where: { id: request.id },
      data: { status: "FILLED", filledById: chosen.employeeId },
    });

    const chosenUser = await db.user.findUnique({
      where: { employeeId: chosen.employeeId },
    });
    if (chosenUser) {
      await db.notification.create({
        data: {
          userId: chosenUser.id,
          title: "You're covering the shift",
          body: request.emailSubject,
          href: "/coverage",
        },
      });
    }
    const otherUsers = await db.user.findMany({
      where: {
        employeeId: {
          in: request.recipients
            .map((r) => r.employeeId)
            .filter((id) => id !== chosen.employeeId),
        },
      },
      select: { id: true },
    });
    if (otherUsers.length > 0) {
      await db.notification.createMany({
        data: otherUsers.map((u) => ({
          userId: u.id,
          title: "Shift coverage is filled",
          body: request.emailSubject,
          href: "/coverage",
        })),
      });
    }

    await audit(user, "CoverageRequest", request.id, "ASSIGN", {
      filledBy: chosen.employeeId,
    });
    revalidatePath("/coverage");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelCoverage(requestId: string): Promise<ActionResult> {
  try {
    const user = require_((await currentUser()) ?? undefined, "coverage.manage");
    const request = await db.coverageRequest.findUnique({ where: { id: requestId } });
    if (!request) return { ok: false, error: "Request not found" };
    if (request.status !== "OPEN") {
      return { ok: false, error: "Only open requests can be cancelled" };
    }
    await db.coverageRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED" },
    });
    await audit(user, "CoverageRequest", requestId, "CANCEL");
    revalidatePath("/coverage");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

function requireEmployeeId(user: { employeeId: string | null }): string {
  if (!user.employeeId) throw new AuthzError("no employee record");
  return user.employeeId;
}

function fail(e: unknown): ActionResult {
  if (e instanceof z.ZodError) {
    return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  }
  if (e instanceof AuthzError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong" };
}
