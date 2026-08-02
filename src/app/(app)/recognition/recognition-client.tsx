"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowRight,
  Compass,
  Handshake,
  HeartHandshake,
  Loader2,
  type LucideIcon,
  Mountain,
  PartyPopper,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { giveRecognition } from "@/actions/recognition";
import type { ActionResult } from "@/actions/people";

const VALUE_ICONS: Record<string, LucideIcon> = {
  compass: Compass,
  rocket: Rocket,
  handshake: Handshake,
  users: Users,
  "heart-handshake": HeartHandshake,
  mountain: Mountain,
  star: Star,
  shield: Shield,
};

function valueIcon(name: string | null): LucideIcon {
  return (name && VALUE_ICONS[name]) || Star;
}

const POINT_OPTIONS = [5, 10, 15, 20, 25];

type Person = { id: string; name: string; photoUrl: string | null };

export type RecognitionPost = {
  id: string;
  message: string;
  points: number;
  createdAt: string;
  giver: Person;
  coreValue: { id: string; name: string; icon: string | null } | null;
  recipients: Person[];
};

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

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

function PersonChip({ person }: { person: Person }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar size="sm">
        <AvatarImage src={person.photoUrl ?? undefined} alt="" />
        <AvatarFallback>{initials(person.name)}</AvatarFallback>
      </Avatar>
      <span className="font-medium">{person.name}</span>
    </span>
  );
}

function PostCard({ post }: { post: RecognitionPost }) {
  const Icon = post.coreValue ? valueIcon(post.coreValue.icon) : null;
  return (
    <Card>
      <CardContent className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <PersonChip person={post.giver} />
            <ArrowRight className="size-3.5 text-muted-foreground" />
            {post.recipients.map((r) => (
              <PersonChip key={r.id} person={r} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              +{post.points}
            </Badge>
            {post.coreValue && Icon && (
              <Badge variant="secondary">
                <Icon /> {post.coreValue.name}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{fmtDate(post.createdAt)}</span>
          </div>
        </div>
        <p className="text-sm whitespace-pre-wrap">{post.message}</p>
      </CardContent>
    </Card>
  );
}

function Feed({ posts, emptyText }: { posts: RecognitionPost[]; emptyText: string }) {
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-muted-foreground">
        <PartyPopper className="size-6" />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}

function GiveRecognitionDialog({
  coreValues,
  employees,
}: {
  coreValues: { id: string; name: string; icon: string | null }[];
  employees: { id: string; name: string }[];
}) {
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [points, setPoints] = useState(10);
  const [coreValueId, setCoreValueId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const toggleRecipient = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const reset = () => {
    setSelected([]);
    setPoints(10);
    setCoreValueId(null);
    setMessage("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Sparkles className="size-4" /> Give Recognition
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Give Recognition</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>
              Who are you recognizing?{" "}
              {selected.length > 0 && (
                <span className="text-muted-foreground">({selected.length} selected)</span>
              )}
            </Label>
            <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border p-2">
              {employees.length === 0 ? (
                <p className="p-1 text-sm text-muted-foreground">No teammates found.</p>
              ) : (
                employees.map((e) => (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selected.includes(e.id)}
                      onChange={() => toggleRecipient(e.id)}
                    />
                    {e.name}
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Points</Label>
            <div className="flex gap-2">
              {POINT_OPTIONS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={points === p ? "default" : "outline"}
                  onClick={() => setPoints(p)}
                >
                  +{p}
                </Button>
              ))}
            </div>
          </div>
          {coreValues.length > 0 && (
            <div className="space-y-1.5">
              <Label>Core value (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {coreValues.map((v) => {
                  const Icon = valueIcon(v.icon);
                  return (
                    <Button
                      key={v.id}
                      type="button"
                      size="sm"
                      variant={coreValueId === v.id ? "default" : "outline"}
                      onClick={() =>
                        setCoreValueId((prev) => (prev === v.id ? null : v.id))
                      }
                    >
                      <Icon className="size-3.5" /> {v.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rec-message">Message</Label>
            <Textarea
              id="rec-message"
              value={message}
              maxLength={500}
              placeholder="What did they do that was great?"
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || selected.length === 0 || message.trim().length === 0}
            onClick={async () => {
              const ok = await run(
                () =>
                  giveRecognition({
                    recipientIds: selected,
                    points,
                    message: message.trim(),
                    coreValueId: coreValueId ?? undefined,
                  }),
                "Recognition sent 🎉",
              );
              if (ok) {
                reset();
                setOpen(false);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecognitionClient({
  posts,
  coreValues,
  employees,
  meId,
  pointsReceived,
  pointsGivenThisMonth,
}: {
  posts: RecognitionPost[];
  coreValues: { id: string; name: string; icon: string | null }[];
  employees: { id: string; name: string }[];
  meId: string | null;
  pointsReceived: number;
  pointsGivenThisMonth: number;
}) {
  const received = meId
    ? posts.filter((p) => p.recipients.some((r) => r.id === meId))
    : [];
  const given = meId ? posts.filter((p) => p.giver.id === meId) : [];
  const selectable = employees.filter((e) => e.id !== meId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid grow gap-4 sm:max-w-md sm:grid-cols-2">
          <Card>
            <CardContent className="pt-2">
              <div className="text-2xl font-bold">{pointsReceived}</div>
              <div className="text-sm text-muted-foreground">Points received</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-2">
              <div className="text-2xl font-bold">{pointsGivenThisMonth}</div>
              <div className="text-sm text-muted-foreground">Given this month</div>
            </CardContent>
          </Card>
        </div>
        {meId && (
          <GiveRecognitionDialog coreValues={coreValues} employees={selectable} />
        )}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="given">Given</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <Feed
            posts={posts}
            emptyText="No recognition yet — be the first to give a shout-out!"
          />
        </TabsContent>
        <TabsContent value="received">
          <Feed posts={received} emptyText="Nothing received yet." />
        </TabsContent>
        <TabsContent value="given">
          <Feed posts={given} emptyText="You haven't recognized anyone yet." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
