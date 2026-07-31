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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";
import { createDocument } from "@/actions/files";

export function NewDocumentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Company Policies",
    content: "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="size-4" /> New document
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-name">Name</Label>
              <Input id="d-name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-cat">Category</Label>
              <Input id="d-cat" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-content">Content (plain text)</Label>
            <Textarea id="d-content" className="min-h-[160px]" value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !form.name || !form.content}
            onClick={async () => {
              setBusy(true);
              const res = await createDocument(form);
              setBusy(false);
              if (res.ok) {
                toast.success("Document created");
                setOpen(false);
                setForm({ name: "", category: form.category, content: "" });
                router.refresh();
              } else {
                toast.error(res.error);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
