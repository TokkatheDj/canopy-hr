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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Megaphone } from "lucide-react";
import { postAnnouncement } from "@/actions/settings";

export function AnnounceDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", pinned: false });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Megaphone className="size-3.5" /> Post announcement
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Post an announcement</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="an-title">Title</Label>
            <Input id="an-title" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="an-body">Message</Label>
            <Textarea id="an-body" className="min-h-[100px]" value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.pinned}
              onCheckedChange={(checked) =>
                setForm({ ...form, pinned: checked === true })
              }
            />
            Pin to the top
          </label>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || form.title.trim().length < 3 || form.body.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              const res = await postAnnouncement(form);
              setBusy(false);
              if (res.ok) {
                toast.success("Announcement posted");
                setOpen(false);
                setForm({ title: "", body: "", pinned: false });
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
