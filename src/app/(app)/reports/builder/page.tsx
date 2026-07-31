import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { REPORT_FIELDS } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ReportBuilder } from "./report-builder";

export const metadata = { title: "Report Builder" };

export default async function ReportBuilderPage() {
  const user = await currentUser();
  if (!user || !can(user, "reports.view")) redirect("/home");

  const [departments, locations] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  const fields = REPORT_FIELDS.filter((f) => user.role === "ADMIN" || !f.adminOnly);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/reports" aria-label="Back to reports" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Custom report builder</h1>
          <p className="text-sm text-muted-foreground">
            Pick fields, filter, group, and export to CSV.
          </p>
        </div>
      </div>

      <ReportBuilder
        availableFields={fields.map((f) => ({ key: f.key, label: f.label }))}
        departments={departments.map((d) => d.name)}
        locations={locations.map((l) => l.name)}
      />
    </div>
  );
}
