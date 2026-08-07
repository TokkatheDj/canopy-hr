import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { currentAsOf, sortedHistory, formatPay } from "@/lib/history";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  EditPersonalDialog,
  AddJobChangeDialog,
  AddCompChangeDialog,
  AddContactDialog,
  AddNoteForm,
  CustomFieldsEditor,
} from "./profile-editors";

export const metadata = { title: "Employee" };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function tenure(hireDate: Date): string {
  const months = Math.floor(
    (Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mo`;
  return m === 0 ? `${y} yr` : `${y} yr ${m} mo`;
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  ONBOARDING: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  OFFBOARDED: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const user = await currentUser();
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      jobInfos: true,
      compensations: true,
      department: true,
      location: true,
      manager: true,
      reports: { where: { status: { not: "OFFBOARDED" } } },
      emergencyContacts: true,
      notes: { orderBy: { createdAt: "desc" } },
      assets: { orderBy: { assignedOn: "desc" } },
      customFieldValues: true,
    },
  });
  if (!emp || !user) notFound();

  const isSelf = user.employeeId === emp.id;
  const isAdmin = user.role === "ADMIN";
  const isDirectManager = emp.managerId != null && user.employeeId === emp.managerId;
  const settings = await db.companySettings.findUnique({ where: { id: "singleton" } });
  const managersSeeComp = Boolean(
    (settings?.flags as { managersSeeCompensation?: boolean } | null)
      ?.managersSeeCompensation,
  );
  const canSeeComp = isAdmin || isSelf || (isDirectManager && managersSeeComp);

  // Home address, personal email, phone, birthday and emergency contacts used
  // to render for every authenticated user, while notes and compensation were
  // gated a few lines away in this same file — so this was an oversight, not a
  // policy. The directory stays company-wide (name, photo, title, department,
  // location, work email); the personal file does not.
  const canSeePersonalDetails = isAdmin || isSelf || isDirectManager;

  const job = currentAsOf(emp.jobInfos);
  const comp = currentAsOf(emp.compensations);
  const jobHistory = sortedHistory(emp.jobInfos);
  const compHistory = sortedHistory(emp.compensations);

  const fieldDefs = await db.customFieldDefinition.findMany({
    where: { entity: "EMPLOYEE" },
    orderBy: { order: "asc" },
  });
  const fieldValues = new Map(emp.customFieldValues.map((v) => [v.definitionId, v.value]));

  const name = `${emp.firstName} ${emp.lastName}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-20 border">
          <AvatarImage src={emp.photoUrl ?? undefined} alt="" />
          <AvatarFallback className="text-xl bg-emerald-100 text-emerald-800">
            {emp.firstName[0]}
            {emp.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {name}
              {emp.preferredName && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  (goes by {emp.preferredName})
                </span>
              )}
            </h1>
            <Badge className={STATUS_STYLE[emp.status]}>
              {emp.status.toLowerCase()}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {job?.title ?? "—"} · {emp.department?.name ?? "—"} ·{" "}
            {emp.location?.name ?? "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            Hired {fmtDate(emp.hireDate)} ({tenure(emp.hireDate)})
            {emp.manager && (
              <>
                {" · Reports to "}
                <Link
                  href={`/people/${emp.manager.id}`}
                  className="text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {emp.manager.firstName} {emp.manager.lastName}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="job">Job</TabsTrigger>
          {canSeePersonalDetails && (
            <TabsTrigger value="emergency">Emergency</TabsTrigger>
          )}
          {(isAdmin || isDirectManager) && (
            <TabsTrigger value="notes">Notes</TabsTrigger>
          )}
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>

        {/* ── Personal ── */}
        <TabsContent value="personal" className="space-y-4 pt-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Contact information</CardTitle>
              {isAdmin && (
                <EditPersonalDialog
                  employee={{
                    id: emp.id,
                    preferredName: emp.preferredName ?? "",
                    personalEmail: emp.personalEmail ?? "",
                    phone: emp.phone ?? "",
                    address: emp.address ?? "",
                    city: emp.city ?? "",
                    state: emp.state ?? "",
                    zip: emp.zip ?? "",
                  }}
                />
              )}
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Work email</dt>
                  <dd>{emp.workEmail}</dd>
                </div>
                {canSeePersonalDetails ? (
                  <>
                    <div>
                      <dt className="text-muted-foreground">Personal email</dt>
                      <dd>{emp.personalEmail ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd>{emp.phone ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Birthday</dt>
                      <dd>
                        {emp.birthDate
                          ? emp.birthDate.toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              timeZone: "UTC",
                            })
                          : "—"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Address</dt>
                      <dd>
                        {[emp.address, emp.city, emp.state, emp.zip]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div className="sm:col-span-2 text-muted-foreground">
                    Personal contact details are visible to {emp.firstName}, their
                    manager, and HR.
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {fieldDefs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>More about {emp.firstName}</CardTitle>
              </CardHeader>
              <CardContent>
                <CustomFieldsEditor
                  employeeId={emp.id}
                  canEdit={isAdmin || isSelf}
                  fields={fieldDefs.map((d) => ({
                    id: d.id,
                    label: d.label,
                    type: d.type,
                    options: (d.options as string[] | null) ?? [],
                    value: fieldValues.get(d.id) ?? "",
                  }))}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Job ── */}
        <TabsContent value="job" className="space-y-4 pt-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Job history</CardTitle>
              {isAdmin && <AddJobChangeDialog employeeId={emp.id} />}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Effective</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobHistory.map((j, i) => (
                    <TableRow key={j.id} className={i === 0 ? "font-medium" : ""}>
                      <TableCell>{fmtDate(j.effectiveDate)}</TableCell>
                      <TableCell>{j.title}</TableCell>
                      <TableCell>{j.departmentName}</TableCell>
                      <TableCell>{j.locationName}</TableCell>
                      <TableCell>{j.employmentType}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {j.changeReason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {canSeeComp && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  Compensation
                  {comp && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      current: {formatPay(comp.payType, comp.amountCents)}
                    </span>
                  )}
                </CardTitle>
                {isAdmin && <AddCompChangeDialog employeeId={emp.id} />}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective</TableHead>
                      <TableHead>Pay</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compHistory.map((c, i) => (
                      <TableRow key={c.id} className={i === 0 ? "font-medium" : ""}>
                        <TableCell>{fmtDate(c.effectiveDate)}</TableCell>
                        <TableCell>{formatPay(c.payType, c.amountCents)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.changeReason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {emp.reports.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Direct reports ({emp.reports.length})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {emp.reports.map((r) => (
                  <Link
                    key={r.id}
                    href={`/people/${r.id}`}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm hover:border-emerald-500"
                  >
                    <Avatar className="size-5">
                      <AvatarImage src={r.photoUrl ?? undefined} alt="" />
                      <AvatarFallback className="text-[9px]">
                        {r.firstName[0]}
                        {r.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    {r.firstName} {r.lastName}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Emergency ── */}
        {canSeePersonalDetails && (
        <TabsContent value="emergency" className="pt-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Emergency contacts</CardTitle>
              {(isAdmin || isSelf) && <AddContactDialog employeeId={emp.id} />}
            </CardHeader>
            <CardContent>
              {emp.emergencyContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No emergency contacts on file.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Primary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emp.emergencyContacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.relationship}</TableCell>
                        <TableCell>{c.phone}</TableCell>
                        <TableCell>{c.isPrimary ? "Yes" : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* ── Notes (managers/admin) ── */}
        {(isAdmin || isDirectManager) && (
          <TabsContent value="notes" className="pt-2">
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAdmin && <AddNoteForm employeeId={emp.id} />}
                {emp.notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {emp.notes.map((n) => (
                      <li key={n.id} className="rounded-lg border p-3 text-sm">
                        <p>{n.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {n.authorName} · {fmtDate(n.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Assets ── */}
        <TabsContent value="assets" className="pt-2">
          <Card>
            <CardHeader>
              <CardTitle>Company assets</CardTitle>
            </CardHeader>
            <CardContent>
              {emp.assets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No assets assigned.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Serial</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Returned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emp.assets.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.category}</TableCell>
                        <TableCell>{a.description}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.serial ?? "—"}
                        </TableCell>
                        <TableCell>{fmtDate(a.assignedOn)}</TableCell>
                        <TableCell>{fmtDate(a.returnedOn)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
