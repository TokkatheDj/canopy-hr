// Report configuration + row assembly shared by the builder UI, the
// runReport server action, and the CSV export route.

import { db } from "@/lib/db";
import { currentAsOf, formatPay } from "@/lib/history";
import { sumLedger } from "@/lib/timeoff/accrual";

export const REPORT_FIELDS = [
  { key: "name", label: "Name", adminOnly: false },
  { key: "title", label: "Job title", adminOnly: false },
  { key: "department", label: "Department", adminOnly: false },
  { key: "location", label: "Location", adminOnly: false },
  { key: "status", label: "Status", adminOnly: false },
  { key: "employmentType", label: "Employment type", adminOnly: false },
  { key: "workEmail", label: "Work email", adminOnly: false },
  { key: "hireDate", label: "Hire date", adminOnly: false },
  { key: "tenureYears", label: "Tenure (years)", adminOnly: false },
  { key: "manager", label: "Manager", adminOnly: false },
  { key: "compensation", label: "Compensation", adminOnly: true },
  { key: "vacationBalance", label: "Vacation balance (h)", adminOnly: false },
] as const;

export type ReportFieldKey = (typeof REPORT_FIELDS)[number]["key"];

export type ReportConfig = {
  fields: ReportFieldKey[];
  filters: {
    department?: string;
    location?: string;
    status?: "ACTIVE" | "ONBOARDING" | "OFFBOARDED";
  };
  groupBy?: "department" | "location" | "status" | "";
};

export type ReportRow = Record<string, string | number>;

export async function assembleReportRows(
  config: ReportConfig,
  includeAdminFields: boolean,
): Promise<{ columns: Array<{ key: string; label: string }>; rows: ReportRow[] }> {
  const fields = REPORT_FIELDS.filter(
    (f) =>
      config.fields.includes(f.key) && (includeAdminFields || !f.adminOnly),
  );

  const employees = await db.employee.findMany({
    where: {
      departmentId: undefined,
      ...(config.filters.status ? { status: config.filters.status } : {}),
      ...(config.filters.department
        ? { department: { name: config.filters.department } }
        : {}),
      ...(config.filters.location
        ? { location: { name: config.filters.location } }
        : {}),
    },
    include: {
      department: true,
      location: true,
      manager: true,
      jobInfos: true,
      compensations: true,
      ledgerEntries: { where: { policy: { type: "VACATION" } } },
    },
    orderBy: { lastName: "asc" },
  });

  const rows: ReportRow[] = employees.map((e) => {
    const job = currentAsOf(e.jobInfos);
    const comp = currentAsOf(e.compensations);
    const row: ReportRow = {};
    for (const f of fields) {
      switch (f.key) {
        case "name":
          row[f.key] = `${e.firstName} ${e.lastName}`;
          break;
        case "title":
          row[f.key] = job?.title ?? "";
          break;
        case "department":
          row[f.key] = e.department?.name ?? "";
          break;
        case "location":
          row[f.key] = e.location?.name ?? "";
          break;
        case "status":
          row[f.key] = e.status;
          break;
        case "employmentType":
          row[f.key] = job?.employmentType ?? "";
          break;
        case "workEmail":
          row[f.key] = e.workEmail;
          break;
        case "hireDate":
          row[f.key] = e.hireDate.toISOString().slice(0, 10);
          break;
        case "tenureYears":
          row[f.key] =
            Math.round(
              ((Date.now() - e.hireDate.getTime()) / (365.25 * 24 * 3600 * 1000)) * 10,
            ) / 10;
          break;
        case "manager":
          row[f.key] = e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "";
          break;
        case "compensation":
          row[f.key] = comp ? formatPay(comp.payType, comp.amountCents) : "";
          break;
        case "vacationBalance":
          row[f.key] = sumLedger(e.ledgerEntries);
          break;
      }
    }
    return row;
  });

  // group-by turns the result into counts per group
  if (config.groupBy) {
    const groupKey = config.groupBy;
    const groupField = REPORT_FIELDS.find((f) => f.key === groupKey);
    const counts = new Map<string, number>();
    for (const e of employees) {
      const value =
        groupKey === "department"
          ? (e.department?.name ?? "—")
          : groupKey === "location"
            ? (e.location?.name ?? "—")
            : e.status;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return {
      columns: [
        { key: "group", label: groupField?.label ?? groupKey },
        { key: "count", label: "Count" },
      ],
      rows: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([group, count]) => ({ group, count })),
    };
  }

  return {
    columns: fields.map((f) => ({ key: f.key, label: f.label })),
    rows,
  };
}

export function toCsv(
  columns: Array<{ key: string; label: string }>,
  rows: ReportRow[],
): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escape(r[c.key] ?? "")).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}
