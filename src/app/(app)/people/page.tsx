import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { currentAsOf } from "@/lib/history";
import { DirectoryTable, type DirectoryRow } from "./directory-table";
import { AddEmployeeDialog } from "./add-employee-dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Network } from "lucide-react";

export const metadata = { title: "People" };

export default async function PeoplePage() {
  const user = await currentUser();
  const employees = await db.employee.findMany({
    include: {
      jobInfos: true,
      department: true,
      location: true,
    },
    orderBy: { lastName: "asc" },
  });
  const departments = await db.department.findMany({ orderBy: { name: "asc" } });
  const locations = await db.location.findMany({ orderBy: { name: "asc" } });

  const rows: DirectoryRow[] = employees.map((e) => {
    const job = currentAsOf(e.jobInfos);
    return {
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      photoUrl: e.photoUrl,
      title: job?.title ?? "—",
      department: e.department?.name ?? "—",
      location: e.location?.name ?? "—",
      workEmail: e.workEmail,
      status: e.status,
    };
  });

  const activeCount = rows.filter((r) => r.status !== "OFFBOARDED").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} current employees
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/people/org-chart" />}
          >
            <Network className="size-4" /> Org Chart
          </Button>
          {user && can(user, "people.edit") && (
            <AddEmployeeDialog
              departments={departments.map((d) => d.name)}
              locations={locations.map((l) => l.name)}
              managers={employees
                .filter((e) => e.status === "ACTIVE")
                .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))}
            />
          )}
        </div>
      </div>
      <DirectoryTable rows={rows} />
    </div>
  );
}
