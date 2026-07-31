"use server";

import { currentUser } from "@/lib/auth";
import { require_ } from "@/lib/authz";
import {
  assembleReportRows,
  type ReportConfig,
  type ReportRow,
} from "@/lib/reports";

export async function runReport(config: ReportConfig): Promise<
  | {
      ok: true;
      columns: Array<{ key: string; label: string }>;
      rows: ReportRow[];
    }
  | { ok: false; error: string }
> {
  try {
    const user = require_(await currentUser() ?? undefined, "reports.view");
    const result = await assembleReportRows(config, user.role === "ADMIN");
    return { ok: true, ...result };
  } catch {
    return { ok: false, error: "Not authorized to run reports" };
  }
}
