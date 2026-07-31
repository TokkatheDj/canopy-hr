import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import {
  assembleReportRows,
  toCsv,
  type ReportConfig,
} from "@/lib/reports";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || !can(user, "reports.view")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const config = (await req.json()) as ReportConfig;
  const { columns, rows } = await assembleReportRows(config, user.role === "ADMIN");
  const csv = toCsv(columns, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="canopy-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
