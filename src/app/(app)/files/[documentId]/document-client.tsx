"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, PenLine, Send } from "lucide-react";
import { signDocument, requestSignatures } from "@/actions/files";

export function SignBlock({
  requestId,
  documentName,
}: {
  requestId: string;
  documentName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card className="border-amber-300 dark:border-amber-800">
      <CardContent className="space-y-3 py-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <PenLine className="size-4 text-amber-500" />
          Your signature is requested on “{documentName}”.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="sign-name">Type your full legal name to sign</Label>
            <Input
              id="sign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-64 font-serif italic"
            />
          </div>
          <Button
            disabled={busy || name.trim().length < 2}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={async () => {
              setBusy(true);
              const res = await signDocument(requestId, name);
              setBusy(false);
              if (res.ok) {
                toast.success("Signed — thank you!");
                router.refresh();
              } else {
                toast.error(res.error);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Sign document
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Typing your name here acts as your electronic signature in this demo.
        </p>
      </CardContent>
    </Card>
  );
}

export function RequestSignaturesDialog({
  documentId,
  employees,
}: {
  documentId: string;
  employees: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const visible = employees.filter((e) =>
    e.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Send className="size-3.5" /> Request signatures
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Request signatures</DialogTitle>
        </DialogHeader>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter people..."
        />
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {visible.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={selected.has(e.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(e.id);
                  else next.delete(e.id);
                  setSelected(next);
                }}
              />
              {e.name}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={busy || selected.size === 0}
            onClick={async () => {
              setBusy(true);
              const res = await requestSignatures(documentId, [...selected]);
              setBusy(false);
              if (res.ok) {
                toast.success(`Requested ${selected.size} signature${selected.size === 1 ? "" : "s"}`);
                setOpen(false);
                setSelected(new Set());
                router.refresh();
              } else {
                toast.error(res.error);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Request ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
