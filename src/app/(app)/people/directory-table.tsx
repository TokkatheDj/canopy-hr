"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DirectoryRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  title: string;
  department: string;
  location: string;
  workEmail: string;
  status: "ONBOARDING" | "ACTIVE" | "OFFBOARDED";
};

const STATUS_STYLE: Record<DirectoryRow["status"], string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  ONBOARDING: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  OFFBOARDED: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

const columns: ColumnDef<DirectoryRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarImage src={row.original.photoUrl ?? undefined} alt="" />
          <AvatarFallback className="text-xs bg-emerald-100 text-emerald-800">
            {row.original.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.workEmail}
          </div>
        </div>
      </div>
    ),
  },
  { accessorKey: "title", header: "Title" },
  { accessorKey: "department", header: "Department" },
  { accessorKey: "location", header: "Location" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge className={STATUS_STYLE[row.original.status]}>
        {row.original.status.toLowerCase()}
      </Badge>
    ),
  },
];

export function DirectoryTable({ rows }: { rows: DirectoryRow[] }) {
  const router = useRouter();
  const [dept, setDept] = useState<string>("all");
  const [status, setStatus] = useState<string>("current");

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department))].sort(),
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (dept !== "all" && r.department !== dept) return false;
    if (status === "current" && r.status === "OFFBOARDED") return false;
    if (status === "offboarded" && r.status !== "OFFBOARDED") return false;
    return true;
  });

  return (
    <DataTable
      columns={columns}
      data={filtered}
      searchPlaceholder="Search people..."
      onRowClick={(row) => router.push(`/people/${row.id}`)}
      toolbar={
        <>
          <Select value={dept} onValueChange={(v) => setDept(v ?? "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v ?? "current")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="offboarded">Offboarded</SelectItem>
              <SelectItem value="everyone">Everyone</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    />
  );
}
