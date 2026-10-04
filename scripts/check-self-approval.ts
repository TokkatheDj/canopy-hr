// LOCAL check (freshly seeded dev database only): nobody can decide their own approval request,
// not even an admin, while normal approvals and the admin override on others' requests still work.
//   npx tsx --env-file=.env scripts/check-self-approval.ts
import { db } from "@/lib/db";
import { actOnApproval, createApproval } from "@/lib/approvals";
import type { SessionUser } from "@/lib/authz";

const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

async function session(email: string): Promise<SessionUser> {
  const u = await db.user.findUniqueOrThrow({ where: { email }, include: { employee: true } });
  const reports = u.employeeId ? await db.employee.count({ where: { managerId: u.employeeId } }) : 0;
  return { id: u.id, email: u.email, role: u.role, employeeId: u.employeeId, name: `${u.employee?.firstName} ${u.employee?.lastName}`, isManager: reports > 0 } as unknown as SessionUser;
}

async function main() {
  if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("refusing: DATABASE_URL is not a local database");
  const admin = await session("admin@canopyhr.demo");
  const adminEmp = await db.employee.findUniqueOrThrow({ where: { id: admin.employeeId! }, include: { manager: true } });
  ok(!!adminEmp.manager, `the demo admin (${adminEmp.firstName}) has a manager (${adminEmp.manager?.firstName})`);

  // 1. The admin's own request: the override must NOT let her approve it.
  const own = await createApproval({ type: "TIME_OFF", requester: { employeeId: admin.employeeId!, name: admin.name! }, summary: "check-self-approval: own" });
  let refused = "";
  try { await actOnApproval(own.id, admin, "APPROVED"); } catch (e) { refused = (e as Error).message; }
  ok(refused === "You can't decide your own request", `admin approving her own request is refused ("${refused}")`);
  ok((await db.approvalRequest.findUniqueOrThrow({ where: { id: own.id } })).status === "PENDING", "and it stays pending");

  // 2. Her real approver (her manager) still can.
  const mgrUser = await db.user.findFirst({ where: { employeeId: adminEmp.managerId! } });
  if (mgrUser) {
    await actOnApproval(own.id, await session(mgrUser.email), "DENIED");
    ok((await db.approvalRequest.findUniqueOrThrow({ where: { id: own.id } })).status === "DENIED", "her manager can still decide it");
  } else {
    console.log("(her manager has no login in the seed - deciding as the assigned approver directly)");
    await actOnApproval(own.id, { ...admin, employeeId: adminEmp.managerId!, role: "MANAGER" } as SessionUser, "DENIED");
    ok((await db.approvalRequest.findUniqueOrThrow({ where: { id: own.id } })).status === "DENIED", "her assigned approver can still decide it");
  }

  // 3. The admin override on someone ELSE's request still works.
  const empUser = await session("employee@canopyhr.demo");
  const other = await createApproval({ type: "TIME_OFF", requester: { employeeId: empUser.employeeId!, name: empUser.name! }, summary: "check-self-approval: other" });
  await actOnApproval(other.id, admin, "DENIED");
  const steps = (await db.approvalRequest.findUniqueOrThrow({ where: { id: other.id } })).steps as Array<{ status: string }>;
  ok(steps[0].status === "DENIED", "the admin can still act on another employee's request");
}
main().finally(() => db.$disconnect());
