"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  updateCompanySettings,
  addCustomField,
  deleteCustomField,
  addHoliday,
  deleteHoliday,
} from "@/actions/settings";

export function CompanySettingsForm({
  initial,
}: {
  initial: {
    companyName: string;
    ein: string;
    address: string;
    managersSeeCompensation: boolean;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cs-name">Company name</Label>
        <Input id="cs-name" value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cs-ein">EIN</Label>
          <Input id="cs-ein" value={form.ein}
            onChange={(e) => setForm({ ...form, ein: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-addr">Address</Label>
          <Input id="cs-addr" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center justify-between rounded-lg border p-3">
        <span className="text-sm">
          <span className="font-medium">Managers can see team compensation</span>
          <span className="block text-muted-foreground">
            Applies to direct reports only; HR admins always can.
          </span>
        </span>
        <Switch
          checked={form.managersSeeCompensation}
          onCheckedChange={(checked) =>
            setForm({ ...form, managersSeeCompensation: checked === true })
          }
        />
      </label>
      <Button
        disabled={busy || !form.companyName.trim()}
        onClick={async () => {
          setBusy(true);
          const res = await updateCompanySettings(form);
          setBusy(false);
          if (res.ok) {
            toast.success("Settings saved");
            router.refresh();
          } else toast.error(res.error);
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save
      </Button>
    </div>
  );
}

export function AddCustomFieldDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: "",
    type: "TEXT" as "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX",
    options: "",
  });

  const TYPE_ITEMS = [
    { value: "TEXT", label: "Text" },
    { value: "NUMBER", label: "Number" },
    { value: "DATE", label: "Date" },
    { value: "SELECT", label: "Dropdown" },
    { value: "CHECKBOX", label: "Checkbox" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add field
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a custom field</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cf-label">Label</Label>
            <Input id="cf-label" value={form.label}
              placeholder="e.g. Favorite brew method"
              onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.type}
              items={TYPE_ITEMS}
              onValueChange={(v) => v && setForm({ ...form, type: v as typeof form.type })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_ITEMS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.type === "SELECT" && (
            <div className="space-y-1.5">
              <Label htmlFor="cf-options">Options (comma separated)</Label>
              <Input id="cf-options" value={form.options}
                placeholder="Pour-over, Espresso, French press"
                onChange={(e) => setForm({ ...form, options: e.target.value })} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.label.trim()}
            onClick={async () => {
              setBusy(true);
              const res = await addCustomField({
                label: form.label,
                type: form.type,
                options:
                  form.type === "SELECT"
                    ? form.options.split(",").map((o) => o.trim()).filter(Boolean)
                    : undefined,
              });
              setBusy(false);
              if (res.ok) {
                toast.success("Field added");
                setOpen(false);
                setForm({ label: "", type: "TEXT", options: "" });
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCustomFieldButton({ fieldId }: { fieldId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Delete field"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await deleteCustomField(fieldId);
        setBusy(false);
        if (res.ok) {
          toast.success("Field deleted");
          router.refresh();
        } else toast.error(res.error);
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </Button>
  );
}

export function AddHolidayForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="h-name">Holiday</Label>
        <Input id="h-name" value={name} className="w-52"
          placeholder="e.g. Founders' Day"
          onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="h-date">Date</Label>
        <Input id="h-date" type="date" value={date}
          onChange={(e) => setDate(e.target.value)} />
      </div>
      <Button
        variant="outline"
        disabled={busy || !name.trim() || !date}
        onClick={async () => {
          setBusy(true);
          const res = await addHoliday(name, date);
          setBusy(false);
          if (res.ok) {
            toast.success("Holiday added");
            setName("");
            setDate("");
            router.refresh();
          } else toast.error(res.error);
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Add
      </Button>
    </div>
  );
}

export function DeleteHolidayButton({ holidayId }: { holidayId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Delete holiday"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await deleteHoliday(holidayId);
        setBusy(false);
        if (res.ok) {
          toast.success("Holiday removed");
          router.refresh();
        } else toast.error(res.error);
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </Button>
  );
}
