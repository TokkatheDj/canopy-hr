// Seeds "Meridian Coffee Co." — a deterministic 52-person demo company.
// Faker is seeded so names/values are stable across resets; dates are anchored
// to the run date so "today" screens (celebrations, who's out) stay alive.
// Run: npm run db:seed  (drops nothing — use `prisma migrate reset` for a clean slate)

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { computeStub, previousPayPeriod, payPeriodFor } from "../src/lib/payroll/engine";
import { splitOvertime } from "../src/lib/timesheets/overtime";

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
  await db.payrollRun.deleteMany();
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

  // ── in-flight time off: who's out today, upcoming, and pending approvals ──
  const jordanReports = await db.employee.findMany({
    where: { managerId: mgrDemo.id, status: "ACTIVE", id: { not: empDemo.id } },
    take: 3,
  });
  const otherActive = await db.employee.findMany({
    where: {
      status: "ACTIVE",
      managerId: { notIn: [mgrDemo.id], not: null },
      id: { notIn: [adminEmp.id, mgrDemo.id, empDemo.id] },
    },
    include: { manager: true },
    take: 8,
  });

  function daysFromNow(n: number): Date {
    const d = new Date(NOW);
    d.setDate(d.getDate() + n);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async function seedApprovedTimeOff(
    empId: string, policyId: string, start: Date, end: Date, days: number,
  ) {
    const totalHours = days * 8;
    const req = await db.timeOffRequest.create({
      data: {
        employeeId: empId, policyId, startDate: start, endDate: end,
        hoursPerDay: 8, totalHours, status: "APPROVED",
      },
    });
    await db.timeOffLedgerEntry.create({
      data: {
        employeeId: empId, policyId, date: start, amountHours: -totalHours,
        kind: "USAGE", note: "Approved time off", periodKey: `usage-${req.id}`,
      },
    });
  }

  // 3 people out today
  await seedApprovedTimeOff(otherActive[0].id, vacation.id, daysFromNow(-2), daysFromNow(2), 5);
  await seedApprovedTimeOff(otherActive[1].id, sick.id, daysFromNow(0), daysFromNow(1), 2);
  await seedApprovedTimeOff(jordanReports[0].id, vacation.id, daysFromNow(-1), daysFromNow(0), 2);
  // upcoming approved (calendar depth)
  await seedApprovedTimeOff(otherActive[2].id, vacation.id, daysFromNow(6), daysFromNow(10), 5);
  await seedApprovedTimeOff(otherActive[3].id, personal.id, daysFromNow(12), daysFromNow(12), 1);
  await seedApprovedTimeOff(otherActive[4].id, vacation.id, daysFromNow(20), daysFromNow(24), 5);

  // pending requests routed through the approval chain (demo Manager + Admin see these)
  async function seedPendingTimeOff(
    emp: { id: string; firstName: string; lastName: string; managerId: string | null },
    policyId: string, policyName: string, start: Date, end: Date, days: number,
  ) {
    const totalHours = days * 8;
    const req = await db.timeOffRequest.create({
      data: {
        employeeId: emp.id, policyId, startDate: start, endDate: end,
        hoursPerDay: 8, totalHours, status: "PENDING",
      },
    });
    const mgr = emp.managerId
      ? await db.employee.findUnique({ where: { id: emp.managerId } })
      : null;
    const steps = [];
    if (mgr) steps.push({ approverId: mgr.id, approverName: `${mgr.firstName} ${mgr.lastName}`, status: "PENDING" });
    if (adminEmp.id !== mgr?.id) steps.push({ approverId: adminEmp.id, approverName: `${adminEmp.firstName} ${adminEmp.lastName}`, status: "PENDING" });
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    await db.approvalRequest.create({
      data: {
        type: "TIME_OFF", targetId: req.id, requesterId: emp.id,
        requesterName: `${emp.firstName} ${emp.lastName}`,
        summary: `${policyName} ${fmt(start)} – ${fmt(end)} (${totalHours}h)`,
        steps, status: "PENDING",
      },
    });
  }

  await seedPendingTimeOff(jordanReports[1], vacation.id, "Vacation", daysFromNow(14), daysFromNow(18), 5);
  await seedPendingTimeOff(jordanReports[2], personal.id, "Personal Days", daysFromNow(8), daysFromNow(8), 1);
  await seedPendingTimeOff(otherActive[5], vacation.id, "Vacation", daysFromNow(21), daysFromNow(25), 5);
  await seedPendingTimeOff(otherActive[6], sick.id, "Sick Leave", daysFromNow(3), daysFromNow(4), 2);

  // guarantee dashboard celebrations: two birthdays this week, one anniversary this month
  const bday1 = new Date(NOW); bday1.setFullYear(YEAR - 31); bday1.setDate(bday1.getDate() + 1);
  const bday2 = new Date(NOW); bday2.setFullYear(YEAR - 27); bday2.setDate(bday2.getDate() + 4);
  await db.employee.update({ where: { id: otherActive[0].id }, data: { birthDate: bday1 } });
  await db.employee.update({ where: { id: jordanReports[0].id }, data: { birthDate: bday2 } });
  const annivDate = new Date(NOW); annivDate.setFullYear(YEAR - 3); annivDate.setDate(15);
  await db.employee.update({ where: { id: otherActive[1].id }, data: { hireDate: annivDate } });

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

  // ── custom fields ──
  const cfShirt = await db.customFieldDefinition.create({
    data: {
      label: "T-shirt size", type: "SELECT", order: 0,
      options: ["XS", "S", "M", "L", "XL", "XXL"],
    },
  });
  const cfCoffee = await db.customFieldDefinition.create({
    data: { label: "Go-to coffee order", type: "TEXT", order: 1 },
  });
  const cfRemoteStipend = await db.customFieldDefinition.create({
    data: { label: "Remote stipend enrolled", type: "CHECKBOX", order: 2 },
  });
  const coffeeOrders = [
    "Oat milk latte", "Cold brew, black", "Cappuccino", "Pour-over, single origin",
    "Espresso, double", "Vanilla latte", "Drip with cream", "Matcha (controversial)",
  ];
  for (const emp of activeEmployees) {
    await db.customFieldValue.create({
      data: {
        definitionId: cfShirt.id, employeeId: emp.id,
        value: faker.helpers.arrayElement(["S", "M", "M", "L", "L", "XL"]),
      },
    });
    await db.customFieldValue.create({
      data: {
        definitionId: cfCoffee.id, employeeId: emp.id,
        value: faker.helpers.arrayElement(coffeeOrders),
      },
    });
    await db.customFieldValue.create({
      data: {
        definitionId: cfRemoteStipend.id, employeeId: emp.id,
        value: String(faker.datatype.boolean()),
      },
    });
  }

  // ── a few assets for the demo employees ──
  for (const [empId, items] of [
    [adminEmp.id, [["Laptop", 'MacBook Pro 14"', "C02XK1"], ["Monitor", 'Dell 27" 4K', "DL27-88"]]],
    [mgrDemo.id, [["Laptop", 'MacBook Pro 16"', "C02XK2"], ["Key card", "HQ badge #142", null]]],
    [empDemo.id, [["Laptop", "ThinkPad X1 Carbon", "TP-9931"], ["Headset", "Jabra Evolve2", null]]],
  ] as Array<[string, Array<[string, string, string | null]>]>) {
    for (const [category, description, serial] of items) {
      await db.asset.create({
        data: {
          employeeId: empId, category, description, serial,
          assignedOn: daysAgo(faker.number.int({ min: 60, max: 600 })),
        },
      });
    }
  }

  // ── pay schedule ──
  await db.paySchedule.create({ data: { name: "Semi-Monthly", frequency: "SEMI_MONTHLY" } });

  // ── benefit plans + enrollments (deductions feed the payroll sim) ──
  const medical = await db.benefitPlan.create({
    data: {
      name: "Cascade Medical PPO", type: "MEDICAL", provider: "Cascade Health",
      description: "PPO with nationwide network, $1,000 deductible.",
      tiers: [
        { tier: "Employee Only", employeeCostCentsPerPayPeriod: 9500 },
        { tier: "Employee + Spouse", employeeCostCentsPerPayPeriod: 19800 },
        { tier: "Family", employeeCostCentsPerPayPeriod: 27400 },
      ],
    },
  });
  const dental = await db.benefitPlan.create({
    data: {
      name: "Brightsmile Dental", type: "DENTAL", provider: "Brightsmile",
      description: "Two cleanings a year covered in full, 50% major services.",
      tiers: [
        { tier: "Employee Only", employeeCostCentsPerPayPeriod: 1400 },
        { tier: "Employee + Spouse", employeeCostCentsPerPayPeriod: 2900 },
        { tier: "Family", employeeCostCentsPerPayPeriod: 4100 },
      ],
    },
  });
  const vision = await db.benefitPlan.create({
    data: {
      name: "Clearview Vision", type: "VISION", provider: "Clearview",
      description: "Annual exam plus $150 frames/contacts allowance.",
      tiers: [
        { tier: "Employee Only", employeeCostCentsPerPayPeriod: 600 },
        { tier: "Employee + Spouse", employeeCostCentsPerPayPeriod: 1100 },
        { tier: "Family", employeeCostCentsPerPayPeriod: 1600 },
      ],
    },
  });
  const k401 = await db.benefitPlan.create({
    data: {
      name: "Meridian 401(k)", type: "RETIREMENT", provider: "Summit Retirement",
      description: "Pre-tax retirement savings; company matches 50% up to 6%.",
      tiers: [],
    },
  });
  await db.enrollmentWindow.create({
    data: {
      name: `Open Enrollment ${YEAR}`,
      startDate: daysAgo(3),
      endDate: daysFromNow(11),
    },
  });
  const tierNames = ["Employee Only", "Employee Only", "Employee + Spouse", "Family"];
  for (const emp of activeEmployees) {
    if (!faker.datatype.boolean({ probability: 0.85 })) continue; // some opted out
    const tier = faker.helpers.arrayElement(tierNames);
    await db.benefitEnrollment.create({
      data: { employeeId: emp.id, planId: medical.id, tier },
    });
    if (faker.datatype.boolean({ probability: 0.7 })) {
      await db.benefitEnrollment.create({
        data: { employeeId: emp.id, planId: dental.id, tier },
      });
    }
    if (faker.datatype.boolean({ probability: 0.5 })) {
      await db.benefitEnrollment.create({
        data: { employeeId: emp.id, planId: vision.id, tier },
      });
    }
    if (faker.datatype.boolean({ probability: 0.6 })) {
      await db.benefitEnrollment.create({
        data: {
          employeeId: emp.id, planId: k401.id,
          electionPct: faker.helpers.arrayElement([3, 4, 5, 6, 8, 10]),
        },
      });
    }
  }

  // ── timesheets for hourly employees: current period, APPROVED ──
  const hourlyComps = await db.compensation.findMany({
    where: { payType: "HOURLY" },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  const hourlyIds = new Set(hourlyComps.map((c) => c.employeeId));
  const hourlyActive = activeEmployees.filter((e) => hourlyIds.has(e.id));
  // current semi-monthly period
  const periodStart = NOW.getDate() <= 15
    ? new Date(Date.UTC(NOW.getFullYear(), NOW.getMonth(), 1))
    : new Date(Date.UTC(NOW.getFullYear(), NOW.getMonth(), 16));
  const periodEnd = NOW.getDate() <= 15
    ? new Date(Date.UTC(NOW.getFullYear(), NOW.getMonth(), 15))
    : new Date(Date.UTC(NOW.getFullYear(), NOW.getMonth() + 1, 0));
  for (const emp of hourlyActive) {
    const period = await db.timesheetPeriod.create({
      data: {
        employeeId: emp.id, periodStart, periodEnd, status: "APPROVED",
      },
    });
    // workdays in period so far
    const cursor = new Date(periodStart);
    const stop = NOW < periodEnd ? NOW : periodEnd;
    while (cursor <= stop) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6 && faker.datatype.boolean({ probability: 0.92 })) {
        const hours = faker.helpers.arrayElement([6, 7, 7.5, 8, 8, 8, 8.5, 9, 10]);
        const clockIn = new Date(cursor.getTime() + 9 * 3600 * 1000);
        await db.timesheetEntry.create({
          data: {
            periodId: period.id,
            date: new Date(cursor),
            clockIn,
            clockOut: new Date(clockIn.getTime() + hours * 3600 * 1000),
            hours,
          },
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // ── hiring: openings, stages, candidates ──
  const STAGE_NAMES = ["New", "Reviewed", "Phone Screen", "Interview", "Offer", "Hired"];
  async function createOpening(spec: {
    title: string; dept: string; loc: string; type: string; description: string;
  }) {
    return db.jobOpening.create({
      data: {
        title: spec.title, departmentName: spec.dept, locationName: spec.loc,
        employmentType: spec.type, description: spec.description,
        stages: { create: STAGE_NAMES.map((name, i) => ({ name, order: i })) },
      },
      include: { stages: { orderBy: { order: "asc" } } },
    });
  }

  const openingEng = await createOpening({
    title: "Senior Software Engineer", dept: "Engineering", loc: "Remote", type: "Full-Time",
    description:
      "We're looking for a senior engineer to help build the systems behind our subscriptions, wholesale ordering, and roastery operations.\n\nWhat you'll do:\n• Design and ship features across our TypeScript/React/Node stack\n• Partner with roastery and retail teams on internal tools\n• Mentor mid-level engineers\n\nWhat we're looking for:\n• 5+ years building production web applications\n• Strong product instincts and communication\n• Bonus: you really like coffee",
  });
  const openingBarista = await createOpening({
    title: "Barista", dept: "Operations", loc: "Portland HQ", type: "Part-Time",
    description:
      "Join the cafe crew at our Portland flagship.\n\nWhat you'll do:\n• Pull shots, pour latte art, and make people's mornings\n• Keep the bar clean, calibrated, and humming\n• Learn our seasonal menu and origin stories\n\nWhat we're looking for:\n• Warmth and hustle — experience is a plus, not a must\n• Weekend availability",
  });
  const openingAE = await createOpening({
    title: "Account Executive", dept: "Sales", loc: "Austin Roastery", type: "Full-Time",
    description:
      "Grow our wholesale program across Texas.\n\nWhat you'll do:\n• Own the full sales cycle for cafes, restaurants, and offices\n• Run tastings and trainings for wholesale partners\n• Work closely with the roastery on fulfillment\n\nWhat we're looking for:\n• 2+ years in B2B sales (food & beverage a plus)\n• Comfortable on the road 2-3 days a week",
  });

  const candidateSpecs: Array<[typeof openingEng, number, string | null]> = [
    // [opening, stage index, note]
    [openingEng, 0, null], [openingEng, 1, "Strong resume, ex-Shopify"], [openingEng, 2, null],
    [openingEng, 3, "Great system design round"], [openingEng, 4, "Offer out — verbal yes"],
    [openingBarista, 0, null], [openingBarista, 0, null], [openingBarista, 1, null],
    [openingBarista, 3, "Trial shift went well"],
    [openingAE, 0, null], [openingAE, 1, null], [openingAE, 2, "Knows the Austin market"],
    [openingAE, 2, null], [openingAE, 3, null],
  ];
  let offerCandidateId: string | null = null;
  for (const [opening, stageIdx, note] of candidateSpecs) {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const cand = await db.candidate.create({
      data: {
        openingId: opening.id,
        stageId: opening.stages[stageIdx].id,
        firstName: first, lastName: last,
        email: faker.internet.email({ firstName: first, lastName: last }).toLowerCase(),
        phone: faker.phone.number({ style: "national" }),
        coverLetter: faker.datatype.boolean() ? faker.lorem.paragraph() : null,
        appliedAt: daysAgo(faker.number.int({ min: 2, max: 30 })),
        events: {
          create: [
            { kind: "APPLIED", body: `Applied to ${opening.title} via the careers page` },
            ...(note ? [{ kind: "NOTE", body: note, actorName: "Avery Collins" }] : []),
          ],
        },
      },
    });
    if (opening.id === openingEng.id && stageIdx === 4) offerCandidateId = cand.id;
  }
  if (offerCandidateId) {
    const offerCand = await db.candidate.findUniqueOrThrow({ where: { id: offerCandidateId } });
    await db.offerLetter.create({
      data: {
        candidateId: offerCandidateId,
        title: "Senior Software Engineer",
        payType: "SALARY",
        salaryCents: 112_000_00,
        startDate: daysFromNow(18),
        body: `Dear ${offerCand.firstName},\n\nWe're delighted to offer you the position of Senior Software Engineer at Meridian Coffee Co. Your annual salary will be $112,000, with a start date of ${daysFromNow(18).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.\n\nThis offer includes our full benefits package: medical, dental, and vision coverage, a 401(k) with company match, and our time-off policies.\n\nWe can't wait to have you on the team.\n\nWarmly,\nThe Meridian Coffee Co. People Team`,
      },
    });
    await db.candidateEvent.create({
      data: {
        candidateId: offerCandidateId, kind: "OFFER_SENT",
        body: "Offer sent: Senior Software Engineer", actorName: "Avery Collins",
      },
    });
  }
  await db.talentPool.create({ data: { name: "Future Engineers" } });
  await db.talentPool.create({ data: { name: "Seasonal Cafe Staff" } });

  // ── checklist templates + instances for onboarding employees ──
  const onboardingTemplate = await db.checklistTemplate.create({
    data: {
      name: "Standard Onboarding", kind: "ONBOARDING",
      tasks: {
        create: [
          { title: "Sign offer letter and employment agreement", assigneeRole: "EMPLOYEE", dueOffsetDays: -5, order: 0 },
          { title: "Complete W-4 and I-9 paperwork", assigneeRole: "EMPLOYEE", dueOffsetDays: -3, order: 1 },
          { title: "Order laptop and equipment", assigneeRole: "IT", dueOffsetDays: -3, order: 2 },
          { title: "Create accounts (email, Slack, HR system)", assigneeRole: "IT", dueOffsetDays: -1, order: 3 },
          { title: "Welcome coffee with the team", assigneeRole: "MANAGER", dueOffsetDays: 0, order: 4 },
          { title: "Review the employee handbook", assigneeRole: "EMPLOYEE", dueOffsetDays: 2, order: 5 },
          { title: "Enroll in benefits", assigneeRole: "EMPLOYEE", dueOffsetDays: 7, order: 6 },
          { title: "30-day check-in with manager", assigneeRole: "MANAGER", dueOffsetDays: 30, order: 7 },
        ],
      },
    },
    include: { tasks: { orderBy: { order: "asc" } } },
  });
  await db.checklistTemplate.create({
    data: {
      name: "Standard Offboarding", kind: "OFFBOARDING",
      tasks: {
        create: [
          { title: "Schedule exit interview", assigneeRole: "HR", dueOffsetDays: -7, order: 0 },
          { title: "Transfer open work and documentation", assigneeRole: "EMPLOYEE", dueOffsetDays: -3, order: 1 },
          { title: "Collect laptop, badge, and equipment", assigneeRole: "IT", dueOffsetDays: 0, order: 2 },
          { title: "Revoke system access", assigneeRole: "IT", dueOffsetDays: 0, order: 3 },
          { title: "Process final pay and PTO payout", assigneeRole: "HR", dueOffsetDays: 3, order: 4 },
        ],
      },
    },
  });

  const onboardingEmps = await db.employee.findMany({ where: { status: "ONBOARDING" } });
  for (const [i, emp] of onboardingEmps.entries()) {
    await db.checklistInstance.create({
      data: {
        templateId: onboardingTemplate.id,
        employeeId: emp.id,
        kind: "ONBOARDING",
        tasks: {
          create: onboardingTemplate.tasks.map((t, idx) => ({
            title: t.title,
            assigneeRole: t.assigneeRole,
            order: t.order,
            dueDate: new Date(emp.hireDate.getTime() + t.dueOffsetDays * 24 * 3600 * 1000),
            // first onboarder is further along than the second
            completedAt: idx < (i === 0 ? 5 : 2) ? daysAgo(faker.number.int({ min: 1, max: 5 })) : null,
            completedBy: idx < (i === 0 ? 5 : 2) ? "Sam Whitfield" : null,
          })),
        },
      },
    });
  }

  // ── company documents + signature requests ──
  const handbook = await db.document.create({
    data: {
      name: "Employee Handbook",
      category: "Company Policies",
      uploadedBy: "Avery Collins",
      inlineHtml:
        "<p><strong>Welcome to Meridian Coffee Co.</strong></p>" +
        "<p>This handbook covers how we work: our values, benefits, time-off policies, and workplace guidelines. It applies to everyone at Meridian, in every location.</p>" +
        "<p><strong>Our values:</strong> Craft over shortcuts. Warmth over polish. Growth for everyone.</p>" +
        "<p><strong>Time off:</strong> Vacation accrues each pay period (5 hours). Sick leave (48h) and personal days (24h) are granted each January. Please request time off in the HR system so your team can plan.</p>" +
        "<p><strong>Payroll:</strong> We pay semi-monthly, on the 15th and the last day of each month.</p>" +
        "<p><strong>Conduct:</strong> Treat teammates, customers, and partners with respect. Report concerns to People Ops — no retaliation, ever.</p>" +
        "<p>Please sign below to acknowledge you've read and understood this handbook.</p>",
    },
  });
  await db.document.create({
    data: {
      name: "Remote Work Policy",
      category: "Company Policies",
      uploadedBy: "Sam Whitfield",
      inlineHtml:
        "<p>Remote employees are expected to be reachable during core hours (10am–3pm Pacific), keep their workspace safe and ergonomic, and use the company stipend for equipment needs.</p><p>We gather in person twice a year — attendance is encouraged and fully covered.</p>",
    },
  });
  await db.document.create({
    data: {
      name: "Expense Reimbursement Guide",
      category: "Finance",
      uploadedBy: "Theo Okafor",
      inlineHtml:
        "<p>Submit expenses within 30 days with receipts. Coffee-related professional development (cuppings, competitions, certifications) is reimbursable up to $500/year.</p>",
    },
  });
  await db.document.create({
    data: {
      name: "Offer Letter — Signed",
      category: "Personal",
      employeeId: empDemo.id,
      uploadedBy: "Avery Collins",
      inlineHtml: "<p>Signed offer letter for Riley Chen — Software Engineer, Engineering.</p>",
    },
  });
  // pending signature for the demo employee
  await db.signatureRequest.create({
    data: { documentId: handbook.id, signerId: empDemo.id },
  });
  // a couple of already-signed handbook acknowledgments
  for (const emp of [mgrDemo, adminEmp]) {
    await db.signatureRequest.create({
      data: {
        documentId: handbook.id,
        signerId: emp.id,
        status: "SIGNED",
        signedName: `${emp.firstName} ${emp.lastName}`,
        signedAt: daysAgo(faker.number.int({ min: 10, max: 60 })),
      },
    });
  }

  // ── performance: review cycles, goals, 1:1s ──
  const REVIEW_QUESTIONS = [
    { id: "q1", prompt: "What went well this cycle?", type: "text" },
    { id: "q2", prompt: "What could have gone better?", type: "text" },
    { id: "q3", prompt: "Overall performance", type: "rating" },
    { id: "q4", prompt: "Growth & development", type: "rating" },
  ];
  const activeWithMgr = await db.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, managerId: true },
  });

  async function seedCycle(name: string, start: Date, end: Date, status: "OPEN" | "CLOSED", fillRate: number) {
    const cycle = await db.reviewCycle.create({
      data: { name, startDate: start, endDate: end, status, questions: REVIEW_QUESTIONS },
    });
    const positives = [
      "Shipped consistently and unblocked teammates.",
      "Great cross-team communication this cycle.",
      "Took real ownership of quality.",
      "Customer instincts keep getting sharper.",
    ];
    const improvements = [
      "Could delegate more instead of doing it all.",
      "Estimates ran optimistic — worth padding.",
      "More written updates would help visibility.",
      "Say no to more meetings.",
    ];
    for (const emp of activeWithMgr) {
      const fill = faker.datatype.boolean({ probability: fillRate });
      const answers = fill
        ? {
            q1: faker.helpers.arrayElement(positives),
            q2: faker.helpers.arrayElement(improvements),
            q3: faker.number.int({ min: 3, max: 5 }),
            q4: faker.number.int({ min: 3, max: 5 }),
          }
        : undefined;
      await db.assessment.create({
        data: {
          cycleId: cycle.id, subjectId: emp.id, authorId: emp.id, kind: "SELF",
          status: fill ? "SUBMITTED" : "NOT_STARTED",
          answers, submittedAt: fill ? faker.date.between({ from: start, to: status === "CLOSED" ? end : NOW }) : null,
        },
      });
      if (emp.managerId) {
        const mgrFill = faker.datatype.boolean({ probability: fillRate });
        await db.assessment.create({
          data: {
            cycleId: cycle.id, subjectId: emp.id, authorId: emp.managerId, kind: "MANAGER",
            status: mgrFill ? "SUBMITTED" : "NOT_STARTED",
            answers: mgrFill
              ? {
                  q1: faker.helpers.arrayElement(positives),
                  q2: faker.helpers.arrayElement(improvements),
                  q3: faker.number.int({ min: 3, max: 5 }),
                  q4: faker.number.int({ min: 3, max: 5 }),
                }
              : undefined,
            submittedAt: mgrFill ? faker.date.between({ from: start, to: status === "CLOSED" ? end : NOW }) : null,
          },
        });
      }
    }
    return cycle;
  }

  await seedCycle(`H2 ${YEAR - 1} Review Cycle`, daysAgo(400), daysAgo(370), "CLOSED", 0.95);
  await seedCycle(`H1 ${YEAR} Review Cycle`, daysAgo(200), daysAgo(170), "CLOSED", 0.9);
  await seedCycle(`Mid-Year ${YEAR} Check-In`, daysAgo(10), daysFromNow(11), "OPEN", 0.35);

  // goals
  const goalTitles = [
    ["Ship the wholesale ordering portal v2", 60],
    ["Get Q3 roast consistency variance under 3%", 40],
    ["Grow Austin wholesale accounts to 45", 75],
    ["Publish the seasonal menu playbook", 25],
    ["Cut cafe waste by 15%", 55],
  ] as const;
  const goalOwners = [empDemo, mgrDemo, ...(await db.employee.findMany({
    where: { status: "ACTIVE", id: { notIn: [empDemo.id, mgrDemo.id] } }, take: 6,
  }))];
  for (const [i, owner] of goalOwners.entries()) {
    const [title, pct] = goalTitles[i % goalTitles.length];
    await db.goal.create({
      data: {
        employeeId: owner.id,
        title: i < goalTitles.length ? title : `${title} (${owner.firstName})`,
        progressPct: pct,
        status: pct >= 70 ? "ON_TRACK" : pct >= 40 ? "ON_TRACK" : "AT_RISK",
        dueDate: daysFromNow(faker.number.int({ min: 20, max: 90 })),
        checkins: {
          create: [
            {
              body: "Kickoff done, scope agreed with stakeholders.",
              progressPct: Math.max(pct - 30, 5),
              createdAt: daysAgo(30),
            },
            {
              body: faker.helpers.arrayElement([
                "Solid progress this week — on schedule.",
                "Slightly behind after the launch crunch, catching up.",
                "Ahead of plan; pulling in stretch items.",
              ]),
              progressPct: pct,
              createdAt: daysAgo(6),
            },
          ],
        },
      },
    });
  }

  // 1:1s between demo manager and reports
  for (const report of jordanReports.slice(0, 2)) {
    await db.oneOnOne.create({
      data: {
        participantAId: mgrDemo.id,
        participantBId: report.id,
        date: daysAgo(7),
        sharedNotes: "Discussed sprint load and the on-call rotation swap.",
      },
    });
  }
  await db.oneOnOne.create({
    data: {
      participantAId: mgrDemo.id,
      participantBId: empDemo.id,
      date: daysAgo(3),
      sharedNotes: "Career chat: aiming for senior track next cycle. Agreed on the wholesale portal as the stretch project.",
    },
  });

  // ── eNPS surveys ──
  const closedSurvey = await db.surveyCycle.create({
    data: {
      name: `Spring ${YEAR} Pulse Survey`,
      startDate: daysAgo(120), endDate: daysAgo(106), status: "CLOSED",
    },
  });
  const springComments = [
    "Love the team, but the roastery AC really needs fixing before summer.",
    "Best place I've worked. More cross-office meetups please!",
    "Growth paths could be clearer for ICs.",
    "The new espresso benefit is amazing.",
    "Communication between HQ and remote could improve.",
  ];
  const springScores = [9,10,8,9,7,10,9,6,8,9,10,7,8,9,5,9,10,8,7,9,10,9,8,4,9,10,8,9,7,8,9,10,6,9,8,9,10,7,9,8];
  for (const [i, score] of springScores.entries()) {
    await db.surveyResponse.create({
      data: {
        cycleId: closedSurvey.id, score,
        comment: i < springComments.length ? springComments[i] : null,
        createdAt: faker.date.between({ from: daysAgo(120), to: daysAgo(106) }),
      },
    });
  }
  const springParticipants = faker.helpers.arrayElements(activeWithMgr, springScores.length);
  for (const p of springParticipants) {
    await db.surveyParticipation.create({
      data: { cycleId: closedSurvey.id, employeeId: p.id, respondedAt: daysAgo(110) },
    });
  }

  const openSurvey = await db.surveyCycle.create({
    data: {
      name: `Summer ${YEAR} Pulse Survey`,
      startDate: daysAgo(4), endDate: daysFromNow(10), status: "OPEN",
    },
  });
  const summerScores = [9, 8, 10, 7, 9, 6, 9, 10, 8];
  for (const [i, score] of summerScores.entries()) {
    await db.surveyResponse.create({
      data: {
        cycleId: openSurvey.id, score,
        comment: i === 0 ? "New timesheet system is so much better." : i === 3 ? "Would love clearer promo criteria." : null,
        createdAt: faker.date.between({ from: daysAgo(4), to: NOW }),
      },
    });
  }
  // participants excluding the demo employee so their respond card shows
  const summerParticipants = faker.helpers.arrayElements(
    activeWithMgr.filter((e) => e.id !== empDemo.id),
    summerScores.length,
  );
  for (const p of summerParticipants) {
    await db.surveyParticipation.create({
      data: { cycleId: openSurvey.id, employeeId: p.id },
    });
  }

  // ── 18 months of PAID payroll history ──
  console.log("Backfilling payroll history (this takes a moment)...");
  const schedule = await db.paySchedule.findFirstOrThrow();
  const payrollEmployees = await db.employee.findMany({
    where: { status: { not: "ONBOARDING" } },
    include: {
      compensations: true,
      enrollments: { include: { plan: true } },
    },
  });

  function currentComp(comps: typeof payrollEmployees[number]["compensations"], asOf: Date) {
    let best = null as (typeof comps)[number] | null;
    for (const c of comps) {
      if (c.effectiveDate <= asOf && (!best || c.effectiveDate > best.effectiveDate)) best = c;
    }
    return best;
  }

  // collect the ~36 previous periods, oldest first
  const periods: Array<{ start: Date; end: Date; payDate: Date }> = [];
  let cursorPeriod = previousPayPeriod(NOW);
  for (let i = 0; i < 36; i++) {
    periods.unshift(cursorPeriod);
    cursorPeriod = previousPayPeriod(cursorPeriod.start);
  }

  for (const period of periods) {
    const run = await db.payrollRun.create({
      data: {
        scheduleId: schedule.id,
        periodStart: period.start,
        periodEnd: period.end,
        payDate: period.payDate,
        status: "PAID",
        approvedAt: new Date(period.payDate.getTime() - 24 * 3600 * 1000),
        paidAt: period.payDate,
      },
    });
    const stubs: Array<{
      runId: string; employeeId: string; lines: object; grossCents: number; netCents: number;
    }> = [];
    for (const emp of payrollEmployees) {
      // only pay people employed during the period
      if (emp.hireDate > period.end) continue;
      if (emp.endDate && emp.endDate < period.start) continue;
      const comp = currentComp(emp.compensations, period.end);
      if (!comp) continue;
      const deductions: Array<{ label: string; amountCents: number }> = [];
      let retirementPct = 0;
      for (const e of emp.enrollments) {
        if (!e.active) continue;
        if (e.plan.type === "RETIREMENT") { retirementPct = e.electionPct ?? 0; continue; }
        const tiers = e.plan.tiers as Array<{ tier: string; employeeCostCentsPerPayPeriod: number }>;
        const tier = tiers.find((t) => t.tier === e.tier);
        if (tier) deductions.push({ label: e.plan.name, amountCents: tier.employeeCostCentsPerPayPeriod });
      }
      const isHourly = comp.payType === "HOURLY";
      const entries = isHourly
        ? Array.from({ length: faker.number.int({ min: 9, max: 11 }) }, (_, d) => ({
            date: new Date(period.start.getTime() + d * 24 * 3600 * 1000),
            hours: faker.helpers.arrayElement([6, 7, 7.5, 8, 8, 8, 8.5, 9]),
          }))
        : [];
      const split = splitOvertime(entries);
      const lines = computeStub({
        payType: comp.payType,
        amountCents: comp.amountCents,
        regularHours: split.regularHours,
        overtimeHours: split.overtimeHours,
        benefitDeductions: deductions,
        retirementPct,
      });
      stubs.push({
        runId: run.id,
        employeeId: emp.id,
        lines,
        grossCents: lines.grossCents,
        netCents: lines.netCents,
      });
    }
    await db.payStub.createMany({ data: stubs.map((s) => ({ ...s, lines: s.lines as object })) });
  }
  // NOTE: the CURRENT period intentionally has no run, so the admin demo can
  // click "Run payroll" and walk draft -> approve -> paid live.
  void payPeriodFor; // (imported for symmetry; current period computed in-app)

  // ── a little pre-baked audit history so the settings tab looks alive ──
  const auditSeed: Array<[string, string, string, object | undefined]> = [
    ["Avery Collins", "PayrollRun", "history", { note: "Approved and paid semi-monthly run" }],
    ["Avery Collins", "Employee", mgrDemo.id, { via: "annual review", changes: "merit increase" }],
    ["Sam Whitfield", "Document", "Employee Handbook", { count: 3 }],
    ["Avery Collins", "ReviewCycle", `Mid-Year ${YEAR} Check-In`, undefined],
    ["Jordan Blake", "ApprovalRequest", "time off", { type: "TIME_OFF", summary: "Vacation approved" }],
  ];
  for (const [i, [actorName, entity, entityId, diff]] of auditSeed.entries()) {
    await db.auditLog.create({
      data: {
        actorName, entity, entityId,
        action: ["APPROVE", "COMP_CHANGE", "SIGNATURES_REQUESTED", "CREATE", "APPROVED"][i],
        diff: diff as object | undefined,
        createdAt: daysAgo(faker.number.int({ min: 1, max: 20 })),
      },
    });
  }

  const counts = await db.employee.count();
  const runCount = await db.payrollRun.count();
  console.log(`Done. ${counts} employees, ${runCount} payroll runs seeded.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
