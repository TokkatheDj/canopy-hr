// LOCAL check of the Oct 2026 time-off fixes (run against a freshly seeded dev database only):
// the year-end carryover cap is applied from Dec 31 2026, and accruals stop at an end date.
//   npx tsx scripts/check-timeoff-fix.ts
import { db } from "@/lib/db";
import { balancesFor, materializeAccruals } from "@/lib/timeoff/materialize";
import { sumLedger } from "@/lib/timeoff/accrual";

const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("refusing: DATABASE_URL is not a local database");

  // 1. Carryover: a Vacation holder, balance pushed over the 40h cap, then the clock moved to Jan 2027.
  const vac = await db.timeOffPolicy.findFirst({ where: { name: "Vacation" } });
  const a = await db.policyAssignment.findFirst({ where: { policyId: vac!.id, employee: { endDate: null } } });
  const emp = a!.employeeId;
  await materializeAccruals(emp, new Date(Date.UTC(2026, 11, 30)));
  const atDec30 = sumLedger(await db.timeOffLedgerEntry.findMany({ where: { employeeId: emp, policyId: vac!.id }, select: { amountHours: true } }));
  if (atDec30 <= 40) {   // make sure there is something to forfeit
    await db.timeOffLedgerEntry.create({ data: { employeeId: emp, policyId: vac!.id, date: new Date(Date.UTC(2026, 11, 1)), amountHours: 60, kind: "ADJUSTMENT", note: "check-timeoff-fix" } });
  }
  await materializeAccruals(emp, new Date(Date.UTC(2027, 0, 2)));
  const carry = await db.timeOffLedgerEntry.findMany({ where: { employeeId: emp, policyId: vac!.id, kind: "CARRYOVER" } });
  const throughJan1 = sumLedger(await db.timeOffLedgerEntry.findMany({ where: { employeeId: emp, policyId: vac!.id, date: { lte: new Date(Date.UTC(2027, 0, 1)) } }, select: { amountHours: true } }));
  ok(carry.length === 1 && carry[0].periodKey === "carryover-2027", `one CARRYOVER entry for 2027 (${carry.map((c) => c.amountHours).join(", ")}h)`);
  ok(Math.abs(throughJan1 - 40) < 0.01, `balance after the Jan 1 2027 forfeiture is the 40h cap (${throughJan1}h)`);
  await materializeAccruals(emp, new Date(Date.UTC(2027, 0, 2)));
  ok((await db.timeOffLedgerEntry.count({ where: { employeeId: emp, policyId: vac!.id, kind: "CARRYOVER" } })) === 1, "reading again adds no second forfeiture");
  ok((await db.timeOffLedgerEntry.count({ where: { kind: "CARRYOVER", date: { lt: new Date(Date.UTC(2027, 0, 1)) } } })) === 0, "nothing is forfeited retroactively (no carryover before 2027)");

  // 2. A leaver: give an employee an end date in the past; balances must ignore later accruals.
  const leaver = await db.policyAssignment.findFirst({ where: { employeeId: { not: emp }, employee: { endDate: null } } });
  const before = (await balancesFor(leaver!.employeeId)).find((b) => b.policyId === leaver!.policyId)!.balanceHours;
  const end = new Date(Date.UTC(2026, 6, 31));
  await db.employee.update({ where: { id: leaver!.employeeId }, data: { endDate: end, status: "OFFBOARDED" } });
  const accruedSince = sumLedger(await db.timeOffLedgerEntry.findMany({ where: { employeeId: leaver!.employeeId, policyId: leaver!.policyId, kind: "ACCRUAL", date: { gt: end } }, select: { amountHours: true } }));
  const after = (await balancesFor(leaver!.employeeId)).find((b) => b.policyId === leaver!.policyId)!.balanceHours;
  ok(accruedSince > 0, `the leaver had ${accruedSince}h accrued after their end date`);
  ok(Math.abs(before - accruedSince - after) < 0.01, `which no longer counts: ${before}h -> ${after}h`);
  await materializeAccruals(leaver!.employeeId, new Date(Date.UTC(2027, 5, 1)));
  ok((await db.timeOffLedgerEntry.count({ where: { employeeId: leaver!.employeeId, kind: "ACCRUAL", date: { gt: new Date(Date.UTC(2026, 11, 31)) } } })) === 0, "and nothing new accrues after leaving, even a year on");
}
main().finally(() => db.$disconnect());
