"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { AuthzError } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

async function windowOpen(): Promise<boolean> {
  const now = new Date();
  const window = await db.enrollmentWindow.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now } },
  });
  return Boolean(window);
}

const enrollSchema = z.object({
  planId: z.string(),
  tier: z.string().optional(),
  electionPct: z.coerce.number().min(0).max(50).optional(),
});

export async function enroll(input: z.infer<typeof enrollSchema>): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    const data = enrollSchema.parse(input);

    if (!(await windowOpen())) {
      return { ok: false, error: "Enrollment changes are only allowed during an open enrollment window" };
    }

    const plan = await db.benefitPlan.findUniqueOrThrow({ where: { id: data.planId } });
    if (plan.type === "RETIREMENT") {
      if (data.electionPct === undefined) {
        return { ok: false, error: "Choose a contribution percentage" };
      }
    } else {
      const tiers = plan.tiers as Array<{ tier: string }>;
      if (!data.tier || !tiers.some((t) => t.tier === data.tier)) {
        return { ok: false, error: "Choose a coverage tier" };
      }
    }

    await db.benefitEnrollment.upsert({
      where: {
        employeeId_planId: { employeeId: user.employeeId, planId: data.planId },
      },
      create: {
        employeeId: user.employeeId,
        planId: data.planId,
        tier: plan.type === "RETIREMENT" ? null : data.tier,
        electionPct: plan.type === "RETIREMENT" ? data.electionPct : null,
      },
      update: {
        active: true,
        tier: plan.type === "RETIREMENT" ? null : data.tier,
        electionPct: plan.type === "RETIREMENT" ? data.electionPct : null,
      },
    });
    await audit(user, "BenefitEnrollment", data.planId, "ENROLL", {
      plan: plan.name,
      tier: data.tier ?? null,
      electionPct: data.electionPct ?? null,
    });
    revalidatePath("/benefits");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function unenroll(planId: string): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user?.employeeId) throw new AuthzError("no employee record");
    if (!(await windowOpen())) {
      return { ok: false, error: "Enrollment changes are only allowed during an open enrollment window" };
    }
    await db.benefitEnrollment.updateMany({
      where: { employeeId: user.employeeId, planId },
      data: { active: false },
    });
    await audit(user, "BenefitEnrollment", planId, "WAIVE");
    revalidatePath("/benefits");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
