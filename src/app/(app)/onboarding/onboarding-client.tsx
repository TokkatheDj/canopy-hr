"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, UserRoundMinus } from "lucide-react";
import { toggleTask, startOffboarding } from "@/actions/onboarding";

export function TaskCheckbox({
  taskId,
  checked,
}: {
  taskId: string;
  checked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Checkbox
      checked={checked}
      disabled={busy}
      className="mt-0.5"
      onCheckedChange={async () => {
        setBusy(true);
        const res = await toggleTask(taskId);
        setBusy(false);
        if (res.ok) router.refresh();
        else toast.error(res.error);
      }}
    />
  );
}

export function StartOffboardingDialog({
  employees,
}: {
  employees: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const twoWeeks = new Date();
  twoWeeks.setDate(twoWeeks.getDate() + 14);
  const [employeeId, setEmployeeId] = useState("");
  const [lastDay, setLastDay] = useState(twoWeeks.toISOString().slice(0, 10));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <UserRoundMinus className="size-4" /> Start offboarding
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Start offboarding</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select
              value={employeeId || undefined}
              items={employees.map((e) => ({ value: e.id, label: e.name }))}
              onValueChange={(v) => v && setEmployeeId(String(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-last">Last day</Label>
            <Input
              id="ob-last"
              type="date"
              value={lastDay}
              onChange={(e) => setLastDay(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This creates the offboarding checklist and marks the employee as
            offboarded with the chosen end date.
          </p>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !employeeId}
            onClick={async () => {
              setBusy(true);
              const res = await startOffboarding(employeeId, lastDay);
              setBusy(false);
              if (res.ok) {
                toast.success("Offboarding started");
                setOpen(false);
                router.refresh();
              } else {
                toast.error(res.error);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
