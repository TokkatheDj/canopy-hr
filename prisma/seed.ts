// Seeds "Meridian Coffee Co." — a deterministic 52-person demo company.
// Faker is seeded so names/values are stable across resets; dates are anchored
// to the run date so "today" screens (celebrations, who's out) stay alive.
// Run: npm run db:seed  (drops nothing — use `prisma migrate reset` for a clean slate)

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

faker.seed(4271);

const NOW = new Date();
const YEAR = NOW.getFullYear();

function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function yearsAgo(n: number, jitterDays = 300): Date {
  return daysAgo(Math.round(n * 365 + faker.number.int({ min: 0, max: jitterDays })));
}

function avatar(seedStr: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seedStr)}&backgroundColor=d1fae5`;
}

type Level = "exec" | "director" | "manager" | "senior" | "mid" | "junior" | "hourly";

const SALARY_BANDS: Record<Level, [number, number]> = {
  exec: [220_000, 260_000],
  director: [150_000, 180_000],
  manager: [120_000, 145_000],
  senior: [95_000, 118_000],
  mid: [75_000, 92_000],
  junior: [55_000, 68_000],
  hourly: [18, 28], // per hour
};

function salaryCents(level: Level): number {
  const [lo, hi] = SALARY_BANDS[level];
  const amt = faker.number.int({ min: lo, max: hi });
  return (level === "hourly" ? Math.round(amt * 100) : Math.round(amt / 500) * 500 * 100);
}

async function main() {
  console.log("Seeding Meridian Coffee Co...");

  // ── wipe (order matters for FKs; most cascade from Employee/User) ──
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.approvalRequest.deleteMany();
  await db.user.deleteMany();
  await db.employee.deleteMany();
  await db.department.deleteMany();
  await db.location.deleteMany();
  await db.timeOffPolicy.deleteMany();
  await db.holiday.deleteMany();
  await db.announcement.deleteMany();
  await db.companyLink.deleteMany();
  await db.companySettings.deleteMany();
  await db.paySchedule.deleteMany();
  await db.benefitPlan.deleteMany();
  await db.enrollmentWindow.deleteMany();
  await db.jobOpening.deleteMany();
  await db.talentPool.deleteMany();
  await db.checklistTemplate.deleteMany();
  await db.reviewCycle.deleteMany();
  await db.surveyCycle.deleteMany();
  await db.document.deleteMany();
  await db.customFieldDefinition.deleteMany();

  // ── org scaffolding ──
  const [ops, eng, sales, mktg, people] = await Promise.all(
    ["Operations", "Engineering", "Sales", "Marketing", "People Ops"].map((name) =>
      db.department.create({ data: { name } }),
    ),
  );
  const [hq, roastery, remote] = await Promise.all([
    db.location.create({ data: { name: "Portland HQ", city: "Portland", state: "OR" } }),
    db.location.create({ data: { name: "Austin Roastery", city: "Austin", state: "TX" } }),
    db.location.create({ data: { name: "Remote", city: "—", state: "—" } }),
  ]);

  await db.companySettings.create({
    data: {
      id: "singleton",
      companyName: "Meridian Coffee Co.",
      ein: "82-4471903",
      address: "1200 NW Lovejoy St, Portland, OR 97209",
      flags: { managersSeeCompensation: true },
    },
  });

  // ── employee factory ──
  type NewEmp = {
    firstName: string;
    lastName: string;
    title: string;
    level: Level;
    dept: { id: string; name: string };
    loc: { id: string; name: string };
    managerId?: string | null;
    hireYears: number; // approx years ago
    status?: "ACTIVE" | "ONBOARDING" | "OFFBOARDED";
    email?: string;
  };

  async function createEmployee(e: NewEmp) {
    const hireDate =
      e.status === "ONBOARDING" ? daysAgo(faker.number.int({ min: 2, max: 10 })) : yearsAgo(e.hireYears);
    const email =
      e.email ??
      `${e.firstName.toLowerCase()}.${e.lastName.toLowerCase()}@meridiancoffee.demo`;
    const isHourly = e.level === "hourly";
    const birth = new Date(NOW);
    birth.setFullYear(YEAR - faker.number.int({ min: 24, max: 58 }));
    birth.setMonth(faker.number.int({ min: 0, max: 11 }));
    birth.setDate(faker.number.int({ min: 1, max: 28 }));

    const emp = await db.employee.create({
      data: {
        firstName: e.firstName,
        lastName: e.lastName,
        workEmail: email,
        personalEmail: faker.internet.email({ firstName: e.firstName, lastName: e.lastName }).toLowerCase(),
        phone: faker.phone.number({ style: "national" }),
        photoUrl: avatar(`${e.firstName}-${e.lastName}`),
        birthDate: birth,
        hireDate,
        status: e.status ?? "ACTIVE",
        endDate: e.status === "OFFBOARDED" ? daysAgo(faker.number.int({ min: 30, max: 400 })) : null,
        address: faker.location.streetAddress(),
        city: e.loc.name === "Remote" ? faker.location.city() : e.loc.name === "Portland HQ" ? "Portland" : "Austin",
        state: e.loc.name === "Remote" ? faker.location.state({ abbreviated: true }) : e.loc.name === "Portland HQ" ? "OR" : "TX",
        zip: faker.location.zipCode("#####"),
        managerId: e.managerId ?? null,
        departmentId: e.dept.id,
        locationId: e.loc.id,
        jobInfos: {
          create: {
            effectiveDate: hireDate,
            title: e.title,
            departmentName: e.dept.name,
            locationName: e.loc.name,
            employmentType: isHourly ? "Part-Time" : "Full-Time",
            changeReason: "Hire",
          },
        },
        compensations: {
          create: {
            effectiveDate: hireDate,
            payType: isHourly ? "HOURLY" : "SALARY",
            amountCents: salaryCents(e.level),
            changeReason: "Hire",
          },
        },
        emergencyContacts: {
          create: {
            name: faker.person.fullName(),
            relationship: faker.helpers.arrayElement(["Spouse", "Partner", "Parent", "Sibling", "Friend"]),
            phone: faker.phone.number({ style: "national" }),
            isPrimary: true,
          },
        },
      },
    });
    return emp;
  }

  // ── leadership ──
  const ceo = await createEmployee({
    firstName: "Marisol", lastName: "Vega", title: "Chief Executive Officer",
    level: "exec", dept: ops, loc: hq, hireYears: 6,
  });
  const headOps = await createEmployee({
    firstName: "Theo", lastName: "Okafor", title: "VP of Operations",
    level: "director", dept: ops, loc: hq, managerId: ceo.id, hireYears: 5,
  });
  const headEng = await createEmployee({
    firstName: "Priya", lastName: "Raman", title: "VP of Engineering",
    level: "director", dept: eng, loc: remote, managerId: ceo.id, hireYears: 5,
  });
  const headSales = await createEmployee({
    firstName: "Marcus", lastName: "Bell", title: "VP of Sales",
    level: "director", dept: sales, loc: hq, managerId: ceo.id, hireYears: 4,
  });
  const headMktg = await createEmployee({
    firstName: "Sofia", lastName: "Lindqvist", title: "Director of Marketing",
    level: "director", dept: mktg, loc: remote, managerId: ceo.id, hireYears: 3,
  });
  // Demo ADMIN: People Ops director
  const adminEmp = await createEmployee({
    firstName: "Avery", lastName: "Collins", title: "Director of People Ops",
    level: "director", dept: people, loc: hq, managerId: ceo.id, hireYears: 4,
    email: "avery.collins@meridiancoffee.demo",
  });

  // ── managers ──
  // Demo MANAGER: engineering manager with 6 reports
  const mgrDemo = await createEmployee({
    firstName: "Jordan", lastName: "Blake", title: "Engineering Manager",
    level: "manager", dept: eng, loc: remote, managerId: headEng.id, hireYears: 3,
    email: "jordan.blake@meridiancoffee.demo",
  });
  const mgrEng2 = await createEmployee({
    firstName: "Lena", lastName: "Fischer", title: "Engineering Manager",
    level: "manager", dept: eng, loc: hq, managerId: headEng.id, hireYears: 3,
  });
  const mgrRoastery = await createEmployee({
    firstName: "Diego", lastName: "Fuentes", title: "Roastery Manager",
    level: "manager", dept: ops, loc: roastery, managerId: headOps.id, hireYears: 4,
  });
  const mgrRetail = await createEmployee({
    firstName: "Hannah", lastName: "Park", title: "Retail Operations Manager",
    level: "manager", dept: ops, loc: hq, managerId: headOps.id, hireYears: 2,
  });
  const mgrSales = await createEmployee({
    firstName: "Omar", lastName: "Haddad", title: "Sales Manager",
    level: "manager", dept: sales, loc: hq, managerId: headSales.id, hireYears: 2,
  });
  const mgrMktg = await createEmployee({
    firstName: "Grace", lastName: "Nguyen", title: "Marketing Manager",
    level: "manager", dept: mktg, loc: remote, managerId: headMktg.id, hireYears: 2,
  });
  const mgrPeople = await createEmployee({
    firstName: "Sam", lastName: "Whitfield", title: "People Ops Manager",
    level: "manager", dept: people, loc: hq, managerId: adminEmp.id, hireYears: 2,
  });

  // ── individual contributors ──
  // Demo EMPLOYEE: reports to Jordan Blake
  const empDemo = await createEmployee({
    firstName: "Riley", lastName: "Chen", title: "Software Engineer",
    level: "mid", dept: eng, loc: remote, managerId: mgrDemo.id, hireYears: 2,
    email: "riley.chen@meridiancoffee.demo",
  });

  const icSpecs: Array<[string, Level, { id: string; name: string }, { id: string; name: string }, string, number]> = [
    // Jordan's team (5 more → 6 reports total)
    ["Senior Software Engineer", "senior", eng, remote, mgrDemo.id, 3],
    ["Software Engineer", "mid", eng, remote, mgrDemo.id, 1],
    ["Software Engineer", "mid", eng, hq, mgrDemo.id, 2],
    ["Junior Software Engineer", "junior", eng, remote, mgrDemo.id, 1],
    ["QA Engineer", "mid", eng, remote, mgrDemo.id, 2],
    // Lena's team
    ["Senior Software Engineer", "senior", eng, hq, mgrEng2.id, 4],
    ["Software Engineer", "mid", eng, hq, mgrEng2.id, 2],
    ["DevOps Engineer", "senior", eng, remote, mgrEng2.id, 3],
    ["Data Analyst", "mid", eng, hq, mgrEng2.id, 1],
    // Roastery
    ["Head Roaster", "senior", ops, roastery, mgrRoastery.id, 5],
    ["Roaster", "hourly", ops, roastery, mgrRoastery.id, 2],
    ["Roaster", "hourly", ops, roastery, mgrRoastery.id, 1],
    ["Production Associate", "hourly", ops, roastery, mgrRoastery.id, 1],
    ["Production Associate", "hourly", ops, roastery, mgrRoastery.id, 2],
    ["Quality Control Specialist", "mid", ops, roastery, mgrRoastery.id, 3],
    ["Logistics Coordinator", "mid", ops, roastery, mgrRoastery.id, 2],
    // Retail ops
    ["Cafe Lead", "hourly", ops, hq, mgrRetail.id, 3],
    ["Barista", "hourly", ops, hq, mgrRetail.id, 1],
    ["Barista", "hourly", ops, hq, mgrRetail.id, 1],
    ["Barista", "hourly", ops, hq, mgrRetail.id, 2],
    ["Supply Chain Analyst", "mid", ops, hq, mgrRetail.id, 2],
    // Sales
    ["Senior Account Executive", "senior", sales, hq, mgrSales.id, 3],
    ["Account Executive", "mid", sales, hq, mgrSales.id, 2],
    ["Account Executive", "mid", sales, remote, mgrSales.id, 1],
    ["Sales Development Rep", "junior", sales, hq, mgrSales.id, 1],
    ["Sales Development Rep", "junior", sales, remote, mgrSales.id, 1],
    ["Wholesale Partnerships Lead", "senior", sales, hq, headSales.id, 4],
    // Marketing
    ["Brand Designer", "mid", mktg, remote, mgrMktg.id, 2],
    ["Content Strategist", "mid", mktg, remote, mgrMktg.id, 1],
    ["Social Media Coordinator", "junior", mktg, remote, mgrMktg.id, 1],
    ["Growth Marketer", "senior", mktg, remote, mgrMktg.id, 2],
    // People Ops
    ["HR Generalist", "mid", people, hq, mgrPeople.id, 2],
    ["Recruiter", "mid", people, hq, mgrPeople.id, 1],
    ["Office Coordinator", "junior", people, hq, mgrPeople.id, 1],
    // Direct to VPs
    ["Executive Assistant", "mid", ops, hq, ceo.id, 3],
    ["Staff Engineer", "senior", eng, remote, headEng.id, 5],
    ["Financial Analyst", "senior", ops, hq, headOps.id, 3],
  ];

  const ics = [empDemo];
  for (const [title, level, dept, loc, managerId, hireYears] of icSpecs) {
    ics.push(
      await createEmployee({
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        title, level, dept, loc, managerId, hireYears,
      }),
    );
  }

  // 2 onboarding, 4 offboarded
  await createEmployee({
    firstName: faker.person.firstName(), lastName: faker.person.lastName(),
    title: "Software Engineer", level: "mid", dept: eng, loc: remote,
    managerId: mgrDemo.id, hireYears: 0, status: "ONBOARDING",
  });
  await createEmployee({
    firstName: faker.person.firstName(), lastName: faker.person.lastName(),
    title: "Barista", level: "hourly", dept: ops, loc: hq,
    managerId: mgrRetail.id, hireYears: 0, status: "ONBOARDING",
  });
  for (const [title, level, dept, loc, managerId] of [
    ["Account Executive", "mid", sales, hq, mgrSales.id],
    ["Barista", "hourly", ops, hq, mgrRetail.id],
    ["Software Engineer", "mid", eng, remote, mgrEng2.id],
    ["Content Strategist", "mid", mktg, remote, mgrMktg.id],
  ] as const) {
    await createEmployee({
      firstName: faker.person.firstName(), lastName: faker.person.lastName(),
      title, level, dept, loc, managerId, hireYears: 3, status: "OFFBOARDED",
    });
  }

  // ── demo users ──
  const passwordHash = await bcrypt.hash("canopy-demo", 10);
  await db.user.create({
    data: { email: "admin@canopyhr.demo", passwordHash, role: "ADMIN", employeeId: adminEmp.id },
  });
  await db.user.create({
    data: { email: "manager@canopyhr.demo", passwordHash, role: "MANAGER", employeeId: mgrDemo.id },
  });
  await db.user.create({
    data: { email: "employee@canopyhr.demo", passwordHash, role: "EMPLOYEE", employeeId: empDemo.id },
  });

  // ── time-off policies + opening balances ──
  const vacation = await db.timeOffPolicy.create({
    data: { name: "Vacation", type: "VACATION", accrualMethod: "PER_PAY_PERIOD", accrualHours: 5, carryoverCapHours: 40 },
  });
  const sick = await db.timeOffPolicy.create({
    data: { name: "Sick Leave", type: "SICK", accrualMethod: "ANNUAL_GRANT", accrualHours: 48 },
  });
  const personal = await db.timeOffPolicy.create({
    data: { name: "Personal Days", type: "PERSONAL", accrualMethod: "ANNUAL_GRANT", accrualHours: 24 },
  });

  const activeEmployees = await db.employee.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
    select: { id: true, hireDate: true },
  });
  for (const emp of activeEmployees) {
    for (const policy of [vacation, sick, personal]) {
      await db.policyAssignment.create({
        data: { employeeId: emp.id, policyId: policy.id, startDate: emp.hireDate },
      });
      const opening =
        policy.id === vacation.id
          ? faker.number.float({ min: 8, max: 72, fractionDigits: 1 })
          : policy.id === sick.id
            ? faker.number.float({ min: 16, max: 48, fractionDigits: 1 })
            : faker.number.float({ min: 0, max: 24, fractionDigits: 1 });
      await db.timeOffLedgerEntry.create({
        data: {
          employeeId: emp.id, policyId: policy.id, date: daysAgo(200),
          amountHours: opening, kind: "ADJUSTMENT",
          periodKey: `opening-${YEAR}`, note: "Opening balance",
        },
      });
    }
  }

  // ── holidays ──
  const holidays: Array<[string, string]> = [
    ["New Year's Day", `${YEAR}-01-01`],
    ["Martin Luther King Jr. Day", `${YEAR}-01-19`],
    ["Memorial Day", `${YEAR}-05-25`],
    ["Independence Day (observed)", `${YEAR}-07-03`],
    ["Labor Day", `${YEAR}-09-07`],
    ["Thanksgiving", `${YEAR}-11-26`],
    ["Day after Thanksgiving", `${YEAR}-11-27`],
    ["Christmas Eve", `${YEAR}-12-24`],
    ["Christmas Day", `${YEAR}-12-25`],
  ];
  for (const [name, date] of holidays) {
    await db.holiday.create({ data: { name, date: new Date(date + "T00:00:00Z") } });
  }

  // ── company content ──
  await db.announcement.create({
    data: {
      title: "Fall blend tasting — Friday 3pm",
      body: "The roastery team is previewing this year's fall blend in the HQ cafe. Remote folks: tasting kits shipped this week!",
      authorName: "Avery Collins", pinned: true,
    },
  });
  await db.announcement.create({
    data: {
      title: "Open enrollment starts Monday",
      body: "Benefits open enrollment runs for two weeks. Review your medical, dental, vision, and 401(k) elections in Benefits.",
      authorName: "Sam Whitfield",
    },
  });
  const links: Array<[string, string]> = [
    ["Employee Handbook", "/files"],
    ["Holiday Calendar", "/time-off"],
    ["Org Chart", "/people/org-chart"],
    ["IT Helpdesk", "https://example.com/helpdesk"],
  ];
  for (let i = 0; i < links.length; i++) {
    await db.companyLink.create({ data: { label: links[i][0], url: links[i][1], order: i } });
  }

  // ── pay schedule (runs generated in later phase) ──
  await db.paySchedule.create({ data: { name: "Semi-Monthly", frequency: "SEMI_MONTHLY" } });

  const counts = await db.employee.count();
  console.log(`Done. ${counts} employees seeded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
