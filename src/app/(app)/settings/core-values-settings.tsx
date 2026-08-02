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
import { Textarea } from "@/components/ui/textarea";
import {
  Compass,
  Handshake,
  HeartHandshake,
  Loader2,
  type LucideIcon,
  Mountain,
  Plus,
  Rocket,
  Shield,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { addCoreValue, deleteCoreValue } from "@/actions/recognition";
import type { ActionResult } from "@/actions/people";

const ICON_OPTIONS = [
  { name: "compass", Icon: Compass },
  { name: "rocket", Icon: Rocket },
  { name: "handshake", Icon: Handshake },
  { name: "users", Icon: Users },
  { name: "heart-handshake", Icon: HeartHandshake },
  { name: "mountain", Icon: Mountain },
  { name: "star", Icon: Star },
  { name: "shield", Icon: Shield },
] as const;

function iconFor(name: string | null): LucideIcon {
  return ICON_OPTIONS.find((o) => o.name === name)?.Icon ?? Star;
}

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

function AddCoreValueDialog() {
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<(typeof ICON_OPTIONS)[number]["name"]>("star");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add core value
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add core value</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cv-name">Name</Label>
            <Input
              id="cv-name"
              value={name}
              maxLength={60}
              placeholder="e.g. Own the outcome"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cv-desc">Description</Label>
            <Textarea
              id="cv-desc"
              value={description}
              maxLength={300}
              placeholder="What does living this value look like?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map(({ name: n, Icon }) => (
                <Button
                  key={n}
                  type="button"
                  size="icon-sm"
                  variant={icon === n ? "default" : "outline"}
                  aria-label={n}
                  onClick={() => setIcon(n)}
                >
                  <Icon className="size-4" />
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || !name.trim() || !description.trim()}
            onClick={async () => {
              const ok = await run(
                () =>
                  addCoreValue({
                    name: name.trim(),
                    description: description.trim(),
                    icon,
                  }),
                "Core value added",
              );
              if (ok) {
                setName("");
                setDescription("");
                setIcon("star");
                setOpen(false);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteValueButton({ id }: { id: string }) {
  const { busy, run } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Delete core value"
      disabled={busy}
      onClick={() => run(() => deleteCoreValue(id), "Core value deleted")}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Trash2 className="size-3.5" />
      )}
    </Button>
  );
}

export function CoreValuesSettings({
  values,
}: {
  values: Array<{ id: string; name: string; description: string; icon: string | null }>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Core values teammates can attach to recognition posts.
        </p>
        <AddCoreValueDialog />
      </div>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No core values yet — add your first one.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((v) => {
            const Icon = iconFor(v.icon);
            return (
              <Card key={v.id}>
                <CardContent className="flex items-start gap-3 pt-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 grow">
                    <div className="text-sm font-medium">{v.name}</div>
                    <p className="text-sm text-muted-foreground">{v.description}</p>
                  </div>
                  <DeleteValueButton id={v.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
