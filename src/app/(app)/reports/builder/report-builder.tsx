"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Play, Download } from "lucide-react";
import { runReport } from "@/actions/reports";
import type { ReportConfig, ReportFieldKey, ReportRow } from "@/lib/reports";

const ALL = "__all__";

export function ReportBuilder({
  availableFields,
  departments,
  locations,
}: {
  availableFields: Array<{ key: string; label: string }>;
  departments: string[];
  locations: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["name", "title", "department", "status"]),
  );
  const [dept, setDept] = useState(ALL);
  const [loc, setLoc] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [groupBy, setGroupBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    columns: Array<{ key: string; label: string }>;
    rows: ReportRow[];
  } | null>(null);

  function buildConfig(): ReportConfig {
    return {
      fields: [...selected] as ReportFieldKey[],
      filters: {
        department: dept === ALL ? undefined : dept,
        location: loc === ALL ? undefined : loc,
        status: status === ALL ? undefined : (status as ReportConfig["filters"]["status"]),
      },
      groupBy: (groupBy || "") as ReportConfig["groupBy"],
    };
  }

  async function run() {
    setBusy(true);
    const res = await runReport(buildConfig());
    setBusy(false);
    if (res.ok) setResult({ columns: res.columns, rows: res.rows });
    else toast.error(res.error);
  }

  async function exportCsv() {
    const res = await fetch("/api/reports/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildConfig()),
    });
    if (!res.ok) {
      toast.error("Export failed");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canopy-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const GROUP_ITEMS = [
    { value: "", label: "No grouping (row per person)" },
    { value: "department", label: "Group by department" },
    { value: "location", label: "Group by location" },
    { value: "status", label: "Group by status" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Fields</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {availableFields.map((f) => (
              <label
                key={f.key}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={selected.has(f.key)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked) next.add(f.key);
                    else next.delete(f.key);
                    setSelected(next);
                  }}
                />
                {f.label}
              </label>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Filters &amp; grouping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select
                  value={dept}
                  items={[
                    { value: ALL, label: "All departments" },
                    ...departments.map((d) => ({ value: d, label: d })),
                  ]}
                  onValueChange={(v) => v && setDept(String(v))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Select
                  value={loc}
                  items={[
                    { value: ALL, label: "All locations" },
                    ...locations.map((l) => ({ value: l, label: l })),
                  ]}
                  onValueChange={(v) => v && setLoc(String(v))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All locations</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={status}
                  items={[
                    { value: ALL, label: "Any status" },
                    { value: "ACTIVE", label: "Active" },
                    { value: "ONBOARDING", label: "Onboarding" },
                    { value: "OFFBOARDED", label: "Offboarded" },
                  ]}
                  onValueChange={(v) => v && setStatus(String(v))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any status</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ONBOARDING">Onboarding</SelectItem>
                    <SelectItem value="OFFBOARDED">Offboarded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Grouping</Label>
              <Select
                value={groupBy}
                items={GROUP_ITEMS}
                onValueChange={(v) => setGroupBy(v === null ? "" : String(v))}
              >
                <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GROUP_ITEMS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-emerald-700 hover:bg-emerald-800 text-white"
                disabled={busy || selected.size === 0}
                onClick={run}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Run report
              </Button>
              {result && result.rows.length > 0 && (
                <Button variant="outline" onClick={exportCsv}>
                  <Download className="size-4" /> Export CSV
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Results ({result.rows.length} row{result.rows.length === 1 ? "" : "s"})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {result.columns.map((c) => (
                    <TableHead key={c.key} className="whitespace-nowrap">
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r, i) => (
                  <TableRow key={i}>
                    {result.columns.map((c) => (
                      <TableCell key={c.key} className="whitespace-nowrap">
                        {r[c.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
