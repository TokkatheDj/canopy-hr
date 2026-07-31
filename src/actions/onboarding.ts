"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { require_ } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/actions/people";

export async function toggleTask(taskId: string): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, error: "Signed out" };
    const task = await db.taskInstance.findUniqueOrThrow({
      where: { id: taskId },
      include: { checklist: true },
    });
    // Admins can check anything; the onboarding employee can check their own
    const isOwn = user.employeeId === task.checklist.employeeId;
    if (user.role !== "ADMIN" && !isOwn) {
      return { ok: false, error: "Not your checklist" };
    }
    const done = Boolean(task.completedAt);
    await db.taskInstance.update({
      where: { id: taskId },
      data: {
        completedAt: done ? null : new Date(),
        completedBy: done ? null : user.name,
      },
    });

    // Completing the last onboarding task activates the employee
    if (!done && task.checklist.kind === "ONBOARDING") {
      const remaining = await db.taskInstance.count({
        where: { checklistId: task.checklistId, completedAt: null },
      });
      if (remaining === 0) {
        await db.employee.update({
          where: { id: task.checklist.employeeId },
          data: { status: "ACTIVE" },
        });
        await audit(user, "Employee", task.checklist.employeeId, "ONBOARDING_COMPLETE");
      }
    }
    revalidatePath("/onboarding");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}

export async function startOffboarding(
  employeeId: string,
  lastDay: string,
): Promise<ActionResult> {
  try {
    const user = require_(await currentUser() ?? undefined, "onboarding.manage");
    const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
    if (employee.status === "OFFBOARDED") {
      return { ok: false, error: "Employee is already offboarded" };
    }
    const existing = await db.checklistInstance.findFirst({
      where: { employeeId, kind: "OFFBOARDING" },
    });
    if (existing) return { ok: false, error: "Offboarding already in progress" };

    const end = new Date(lastDay + "T00:00:00Z");
    const template = await db.checklistTemplate.findFirst({
      where: { kind: "OFFBOARDING" },
      include: { tasks: { orderBy: { order: "asc" } } },
    });
    if (!template) return { ok: false, error: "No offboarding template configured" };

    await db.checklistInstance.create({
      data: {
        templateId: template.id,
        employeeId,
        kind: "OFFBOARDING",
        tasks: {
          create: template.tasks.map((t) => ({
            title: t.title,
            assigneeRole: t.assigneeRole,
            order: t.order,
            dueDate: new Date(end.getTime() + t.dueOffsetDays * 24 * 3600 * 1000),
          })),
        },
      },
    });
    await db.employee.update({
      where: { id: employeeId },
      data: { endDate: end, status: "OFFBOARDED" },
    });
    await audit(user, "Employee", employeeId, "OFFBOARDING_STARTED", {
      lastDay,
    });
    revalidatePath("/onboarding");
    revalidatePath("/people");
    revalidatePath(`/people/${employeeId}`);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
