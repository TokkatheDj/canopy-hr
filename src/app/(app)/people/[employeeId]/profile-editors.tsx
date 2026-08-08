"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { todayLocalISO } from "@/lib/utils";
import { Pencil, Plus, Loader2 } from "lucide-react";
import {
  adminUpdatePersonal,
  adminAddJobChange,
  adminAddCompChange,
  addEmergencyContact,
  addNote,
  setCustomFieldValue,
  type ActionResult,
} from "@/actions/people";

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(
    action: () => Promise<ActionResult>,
    close?: () => void,
  ) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.ok) {
      toast.success("Saved");
      close?.();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }
  return { busy, submit };
}

/**
 * Dialog open/close wired so CLOSING RESETS THE FORM.
 *
 * Every one of these dialogs used to keep its state for the life of the page:
 * save an emergency contact, reopen the dialog, and the previous values were
 * still sitting there with an enabled Save button. One more click created a
 * duplicate contact — or a duplicate comp row, or a duplicate job change.
 * Cancelling was just as bad: abandoned edits reappeared next time as if they
 * had been saved.
 */
function useResettableDialog<T>(makeInitial: () => T) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<T>(makeInitial);
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setForm(makeInitial());
  }
  return { open, setOpen, form, setForm, onOpenChange };
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{label}</Label>
      <Input {...props} />
    </div>
  );
}

// ── Personal info (admin) ───────────────────────────────────────

export function EditPersonalDialog({
  employee,
}: {
  employee: {
    id: string;
    preferredName: string;
    personalEmail: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
}) {
  const { open, form, setForm, onOpenChange } = useResettableDialog(() => employee);
  const { busy, submit } = useSubmit();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Pencil className="size-3.5" /> Edit
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit contact information</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preferred name" id="pn" value={form.preferredName}
            onChange={(e) => setForm({ ...form, preferredName: e.target.value })} />
          <Field label="Personal email" id="pe" value={form.personalEmail}
            onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} />
          <Field label="Phone" id="ph" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Field label="Address" id="ad" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Field label="City" id="ci" value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Field label="State" id="st" value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <Field label="ZIP" id="zi" value={form.zip}
            onChange={(e) => setForm({ ...form, zip: e.target.value })} />
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() =>
              submit(
                () => adminUpdatePersonal({ employeeId: employee.id, ...form }),
                () => onOpenChange(false),
              )
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Job change (admin) ──────────────────────────────────────────

export function AddJobChangeDialog({ employeeId }: { employeeId: string }) {
  const { open, form, setForm, onOpenChange } = useResettableDialog(() => ({
    // todayLocalISO, not toISOString: the UTC form defaulted to TOMORROW for
    // anyone west of Greenwich after late afternoon, and adminAddJobChange now
    // keys off the effective date, so a wrong default silently means "does not
    // apply yet".
    effectiveDate: todayLocalISO(),
    title: "",
    departmentName: "Operations",
    locationName: "Portland HQ",
    employmentType: "Full-Time",
    changeReason: "Promotion",
  }));
  const { busy, submit } = useSubmit();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Job change
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record a job change</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Effective date" id="jd" type="date" value={form.effectiveDate}
            onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
          <Field label="Title" id="jt" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.departmentName}
                onValueChange={(v) => v && setForm({ ...form, departmentName: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Operations", "Engineering", "Sales", "Marketing", "People Ops"].map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={form.locationName}
                onValueChange={(v) => v && setForm({ ...form, locationName: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Portland HQ", "Austin Roastery", "Remote"].map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Employment type</Label>
              <Select value={form.employmentType}
                onValueChange={(v) => v && setForm({ ...form, employmentType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Full-Time", "Part-Time", "Contractor"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={form.changeReason}
                onValueChange={(v) => v && setForm({ ...form, changeReason: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Promotion", "Transfer", "Title Change", "Re-organization"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.title}
            onClick={() =>
              submit(() => adminAddJobChange({ employeeId, ...form }), () => onOpenChange(false))
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Compensation change (admin) ─────────────────────────────────

export function AddCompChangeDialog({ employeeId }: { employeeId: string }) {
  const { open, form, setForm, onOpenChange } = useResettableDialog(() => ({
    effectiveDate: todayLocalISO(),
    payType: "SALARY" as "SALARY" | "HOURLY",
    amountDollars: "",
    changeReason: "Merit Increase",
  }));
  const { busy, submit } = useSubmit();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Comp change
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record a compensation change</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Effective date" id="cd" type="date" value={form.effectiveDate}
            onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pay type</Label>
              <Select value={form.payType}
                onValueChange={(v) => v && setForm({ ...form, payType: v as "SALARY" | "HOURLY" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALARY">Salary (annual)</SelectItem>
                  <SelectItem value="HOURLY">Hourly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field
              label={form.payType === "SALARY" ? "Amount ($/yr)" : "Amount ($/hr)"}
              id="ca" type="number" min="0" step="0.01" value={form.amountDollars}
              onChange={(e) => setForm({ ...form, amountDollars: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={form.changeReason}
              onValueChange={(v) => v && setForm({ ...form, changeReason: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Merit Increase", "Promotion", "Market Adjustment", "Annual Review"].map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.amountDollars}
            onClick={() =>
              submit(
                () =>
                  adminAddCompChange({
                    employeeId,
                    effectiveDate: form.effectiveDate,
                    payType: form.payType,
                    amountDollars: Number(form.amountDollars),
                    changeReason: form.changeReason,
                  }),
                () => onOpenChange(false),
              )
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Emergency contact (self or admin) ───────────────────────────

export function AddContactDialog({ employeeId }: { employeeId: string }) {
  const { open, form, setForm, onOpenChange } = useResettableDialog(() => ({
    name: "",
    relationship: "",
    phone: "",
  }));
  const { busy, submit } = useSubmit();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add contact
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add emergency contact</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name" id="en" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Relationship" id="er" value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
          <Field label="Phone" id="ep" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.name || !form.phone}
            onClick={() =>
              submit(
                () => addEmergencyContact({ employeeId, ...form }),
                () => onOpenChange(false),
              )
            }
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Notes (admin) ───────────────────────────────────────────────

export function AddNoteForm({ employeeId }: { employeeId: string }) {
  const [body, setBody] = useState("");
  const { busy, submit } = useSubmit();

  return (
    <div className="flex gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a note..."
        className="min-h-[60px]"
      />
      <Button
        disabled={busy || !body.trim()}
        onClick={() => submit(() => addNote(employeeId, body), () => setBody(""))}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Add"}
      </Button>
    </div>
  );
}

// ── Custom fields ───────────────────────────────────────────────

export function CustomFieldsEditor({
  employeeId,
  canEdit,
  fields,
}: {
  employeeId: string;
  canEdit: boolean;
  fields: Array<{
    id: string;
    label: string;
    type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";
    options: string[];
    value: string;
  }>;
}) {
  const { submit } = useSubmit();

  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
      {fields.map((f) => (
        <div key={f.id}>
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className="mt-0.5">
            {!canEdit ? (
              f.type === "CHECKBOX" ? (f.value === "true" ? "Yes" : "No") : f.value || "—"
            ) : f.type === "SELECT" ? (
              <Select
                value={f.value || undefined}
                onValueChange={(v) =>
                  v && submit(() => setCustomFieldValue(employeeId, f.id, v))
                }
              >
                <SelectTrigger className="h-8 w-48">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : f.type === "CHECKBOX" ? (
              <Checkbox
                checked={f.value === "true"}
                onCheckedChange={(checked) =>
                  submit(() =>
                    setCustomFieldValue(employeeId, f.id, String(checked === true)),
                  )
                }
              />
            ) : (
              <Input
                defaultValue={f.value}
                type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text"}
                className="h-8 w-48"
                onBlur={(e) => {
                  if (e.target.value !== f.value) {
                    submit(() => setCustomFieldValue(employeeId, f.id, e.target.value));
                  }
                }}
              />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
