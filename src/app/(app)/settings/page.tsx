import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CompanySettingsForm,
  AddCustomFieldDialog,
  DeleteCustomFieldButton,
  AddHolidayForm,
  DeleteHolidayButton,
} from "./settings-client";
import { Check, Minus } from "lucide-react";

export const metadata = { title: "Settings" };

const PERMISSIONS_MATRIX: Array<{ area: string; admin: string; manager: string; employee: string }> = [
  { area: "Employee directory & org chart", admin: "full", manager: "view", employee: "view" },
  { area: "Employee records (edit)", admin: "full", manager: "—", employee: "request changes" },
  { area: "Compensation visibility", admin: "everyone", manager: "own team*", employee: "self" },
  { area: "Hiring & candidates", admin: "full", manager: "—", employee: "—" },
  { area: "Onboarding / offboarding", admin: "full", manager: "—", employee: "own tasks" },
  { area: "Time-off approvals", admin: "all", manager: "own team", employee: "—" },
  { area: "Timesheet approvals", admin: "all", manager: "own team", employee: "—" },
  { area: "Payroll", admin: "full", manager: "—", employee: "own pay stubs" },
  { area: "Benefits administration", admin: "full", manager: "own elections", employee: "own elections" },
  { area: "Performance cycles", admin: "full", manager: "team reviews", employee: "self + peer" },
  { area: "Survey results", admin: "full", manager: "—", employee: "respond only" },
  { area: "Reports", admin: "full", manager: "view", employee: "—" },
  { area: "Files & signatures", admin: "full", manager: "view + sign", employee: "view + sign" },
  { area: "Settings & audit log", admin: "full", manager: "—", employee: "—" },
];

function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user || !can(user, "settings.manage")) redirect("/home");

  const [settings, fields, holidays, auditRows] = await Promise.all([
    db.companySettings.findUnique({ where: { id: "singleton" } }),
    db.customFieldDefinition.findMany({ orderBy: { order: "asc" } }),
    db.holiday.findMany({ orderBy: { date: "asc" } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const flags = (settings?.flags as { managersSeeCompensation?: boolean } | null) ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Company configuration, access levels, and the audit trail.
        </p>
      </div>

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="access">Access levels</TabsTrigger>
          <TabsTrigger value="fields">Custom fields</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="pt-2">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="text-base">Company profile</CardTitle>
            </CardHeader>
            <CardContent>
              <CompanySettingsForm
                initial={{
                  companyName: settings?.companyName ?? "",
                  ein: settings?.ein ?? "",
                  address: settings?.address ?? "",
                  managersSeeCompensation: Boolean(flags.managersSeeCompensation),
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Permissions matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Admin (HR)</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Employee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERMISSIONS_MATRIX.map((row) => (
                    <TableRow key={row.area}>
                      <TableCell className="font-medium">{row.area}</TableCell>
                      {[row.admin, row.manager, row.employee].map((v, i) => (
                        <TableCell key={i}>
                          {v === "full" || v === "all" || v === "everyone" ? (
                            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                              <Check className="size-3.5" /> {v}
                            </span>
                          ) : v === "—" ? (
                            <Minus className="size-3.5 text-muted-foreground" />
                          ) : (
                            <span className="text-muted-foreground">{v}</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                * Managers see their direct reports&apos; compensation only when
                the toggle in Company settings allows it. Enforcement lives in
                the server layer (<code>src/lib/authz.ts</code>), not just the UI.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fields" className="pt-2">
          <Card className="max-w-2xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Custom employee fields
              </CardTitle>
              <AddCustomFieldDialog />
            </CardHeader>
            <CardContent>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No custom fields yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Options</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.label}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{f.type.toLowerCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {((f.options as string[] | null) ?? []).join(", ")}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeleteCustomFieldButton fieldId={f.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Custom fields appear on every employee profile under “More about”.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays" className="pt-2">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="text-base">Company holidays</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddHolidayForm />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Holiday</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{h.name}</TableCell>
                      <TableCell>
                        {h.date.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteHolidayButton holidayId={h.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Audit log <span className="font-normal text-muted-foreground">(latest 50)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditRows.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {fmtDateTime(a.createdAt)}
                      </TableCell>
                      <TableCell>{a.actorName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.action.toLowerCase()}</Badge>
                      </TableCell>
                      <TableCell>{a.entity}</TableCell>
                      <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                        {a.diff ? JSON.stringify(a.diff) : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
