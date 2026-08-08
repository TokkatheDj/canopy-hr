"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserRoundPlus, KeyRound } from "lucide-react";
import { createEmployee } from "@/actions/people";

const EMPLOYMENT_TYPES = ["Full-Time", "Part-Time", "Contractor"];
const ROLES = ["EMPLOYEE", "MANAGER", "ADMIN"] as const;

export function AddEmployeeDialog({
  departments,
  locations,
  managers,
}: {
  departments: string[];
  locations: string[];
  managers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    employeeId: string;
    email: string;
    tempPassword: string;
  } | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    workEmail: "",
    hireDate: today,
    title: "",
    departmentName: departments[0] ?? "",
    locationName: locations[0] ?? "",
    employmentType: EMPLOYMENT_TYPES[0],
    payType: "SALARY" as "SALARY" | "HOURLY",
    amountDollars: "",
    managerId: "",
    role: "EMPLOYEE" as (typeof ROLES)[number],
  });

  const suggestEmail = () => {
    if (form.workEmail || !form.firstName || !form.lastName) return;
    setForm((f) => ({
      ...f,
      workEmail: `${f.firstName}.${f.lastName}@meridiancoffee.demo`
        .toLowerCase()
        .replace(/\s+/g, ""),
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setCreated(null);
      }}
    >
      <DialogTrigger
        render={
          <Button className="bg-emerald-700 hover:bg-emerald-800 text-white">
            <UserRoundPlus className="size-4" /> Add employee
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Employee added</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                Share these login details with them — the temporary password is
                shown only once.
              </p>
              <div className="rounded-lg border bg-muted/40 p-3 font-mono text-sm">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  {created.email}
                </div>
                <div className="mt-1 pl-5.5">{created.tempPassword}</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
              <Button
                nativeButton={false}
                render={<Link href={`/people/${created.employeeId}`} />}
              >
                View profile
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add an employee</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ae-fn">First name</Label>
                  <Input id="ae-fn" value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    onBlur={suggestEmail} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ae-ln">Last name</Label>
                  <Input id="ae-ln" value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    onBlur={suggestEmail} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ae-em">Work email</Label>
                <Input id="ae-em" type="email" value={form.workEmail}
                  onChange={(e) => setForm({ ...form, workEmail: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ae-title">Job title</Label>
                  <Input id="ae-title" value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ae-hd">Hire date</Label>
                  <Input id="ae-hd" type="date" value={form.hireDate}
                    onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select
                    value={form.departmentName}
                    items={departments.map((d) => ({ value: d, label: d }))}
                    onValueChange={(v) => v && setForm({ ...form, departmentName: String(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Select
                    value={form.locationName}
                    items={locations.map((l) => ({ value: l, label: l }))}
                    onValueChange={(v) => v && setForm({ ...form, locationName: String(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Employment type</Label>
                  <Select
                    value={form.employmentType}
                    items={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t }))}
                    onValueChange={(v) => v && setForm({ ...form, employmentType: String(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Manager</Label>
                  <Select
                    value={form.managerId}
                    items={[
                      { value: "", label: "None" },
                      ...managers.map((m) => ({ value: m.id, label: m.name })),
                    ]}
                    onValueChange={(v) => setForm({ ...form, managerId: String(v ?? "") })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {managers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Pay type</Label>
                  <Select
                    value={form.payType}
                    items={[
                      { value: "SALARY", label: "Salary (annual)" },
                      { value: "HOURLY", label: "Hourly" },
                    ]}
                    onValueChange={(v) =>
                      v && setForm({ ...form, payType: v as "SALARY" | "HOURLY" })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALARY">Salary (annual)</SelectItem>
                      <SelectItem value="HOURLY">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ae-pay">
                    {form.payType === "SALARY" ? "Salary ($/yr)" : "Rate ($/hr)"}
                  </Label>
                  <Input id="ae-pay" type="number" min="1" value={form.amountDollars}
                    onChange={(e) => setForm({ ...form, amountDollars: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Access level</Label>
                <Select
                  value={form.role}
                  items={ROLES.map((r) => ({ value: r, label: r.toLowerCase() }))}
                  onValueChange={(v) =>
                    v && setForm({ ...form, role: v as (typeof ROLES)[number] })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r.toLowerCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={
                  busy ||
                  !form.firstName ||
                  !form.lastName ||
                  !form.workEmail ||
                  !form.title ||
                  !form.amountDollars
                }
                onClick={async () => {
                  setBusy(true);
                  const res = await createEmployee({
                    ...form,
                    managerId: form.managerId || undefined,
                    amountDollars: Number(form.amountDollars),
                  });
                  setBusy(false);
                  if (res.ok) {
                    toast.success("Employee added");
                    setCreated({ employeeId: res.employeeId, ...res.login });
                    router.refresh();
                  } else {
                    toast.error(res.error);
                  }
                }}
              >
                {busy && <Loader2 className="size-4 animate-spin" />} Add employee
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
