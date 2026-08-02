"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  createTrainingCategory,
  createTrainingCourse,
  deleteTrainingCategory,
  deleteTrainingCourse,
} from "@/actions/training";
import type { ActionResult } from "@/actions/people";

const FREQUENCIES = [
  { value: "", label: "One-time" },
  { value: "1", label: "Every 1 month" },
  { value: "3", label: "Every 3 months" },
  { value: "6", label: "Every 6 months" },
  { value: "12", label: "Every 12 months" },
  { value: "24", label: "Every 24 months" },
];

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<ActionResult>, successMsg?: string) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.ok) {
      if (successMsg) toast.success(successMsg);
      router.refresh();
      return true;
    }
    toast.error(res.error);
    return false;
  }
  return { busy, run };
}

function AddCourseDialog({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const { busy, run } = useAction();
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    required: false,
    frequency: "",
    dueDays: "",
  });

  const categoryItems = [
    { value: "", label: "None" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setForm({ name: "", categoryId: "", required: false, frequency: "", dueDays: "" });
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add course
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a course</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tc-name">Name</Label>
            <Input
              id="tc-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Food Safety Basics"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={form.categoryId}
              items={categoryItems}
              onValueChange={(v) => setForm({ ...form, categoryId: String(v ?? "") })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select
              value={form.frequency}
              items={FREQUENCIES}
              onValueChange={(v) => setForm({ ...form, frequency: String(v ?? "") })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tc-due">Due within (days from hire, optional)</Label>
            <Input
              id="tc-due"
              type="number"
              min="1"
              value={form.dueDays}
              onChange={(e) => setForm({ ...form, dueDays: e.target.value })}
              placeholder="e.g. 30"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.required}
              onCheckedChange={(checked) => setForm({ ...form, required: checked === true })}
            />
            Required for all employees
          </label>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.name.trim()}
            onClick={async () => {
              const ok = await run(
                () =>
                  createTrainingCourse({
                    name: form.name,
                    categoryId: form.categoryId || undefined,
                    required: form.required,
                    frequencyMonths: form.frequency ? Number(form.frequency) : null,
                    dueDaysFromHire: form.dueDays ? Number(form.dueDays) : null,
                  }),
                "Course added",
              );
              if (ok) setOpen(false);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Add course
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TrainingSettings({
  categories,
  courses,
}: {
  categories: Array<{ id: string; name: string; order: number }>;
  courses: Array<{
    id: string;
    name: string;
    categoryId: string | null;
    required: boolean;
    frequencyMonths: number | null;
    dueDaysFromHire: number | null;
  }>;
}) {
  const { busy, run } = useAction();
  const [newCategory, setNewCategory] = useState("");
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <Card className="max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Training courses</CardTitle>
          <AddCourseDialog categories={categories} />
        </CardHeader>
        <CardContent>
          {courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {(c.categoryId && categoryName.get(c.categoryId)) || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.required ? "required" : "optional"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.frequencyMonths == null
                        ? "One-time"
                        : `Every ${c.frequencyMonths} months`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.dueDaysFromHire == null
                        ? "—"
                        : `${c.dueDaysFromHire} days from hire`}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${c.name}`}
                        disabled={busy}
                        onClick={() => run(() => deleteTrainingCourse(c.id), "Course deleted")}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category name"
            />
            <Button
              variant="outline"
              disabled={busy || !newCategory.trim()}
              onClick={async () => {
                const ok = await run(
                  () => createTrainingCategory(newCategory),
                  "Category added",
                );
                if (ok) setNewCategory("");
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </div>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <ul className="space-y-1">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm"
                >
                  <span>{c.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${c.name}`}
                    disabled={busy}
                    onClick={() => run(() => deleteTrainingCategory(c.id), "Category deleted")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Deleting a category leaves its courses uncategorized.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
