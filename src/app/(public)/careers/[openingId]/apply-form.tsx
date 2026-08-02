"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, PartyPopper } from "lucide-react";
import { applyToJob } from "@/actions/hiring";

export function ApplyForm({ openingId }: { openingId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resume, setResume] = useState<File | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    coverLetter: "",
  });

  if (done) {
    return (
      <Card className="border-emerald-300 dark:border-emerald-800">
        <CardContent className="flex items-center gap-3 py-6">
          <PartyPopper className="size-8 text-emerald-600" />
          <div>
            <p className="font-semibold">Application received!</p>
            <p className="text-sm text-muted-foreground">
              Thanks for applying — our team will be in touch soon.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply for this role</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (resume && resume.size > 4 * 1024 * 1024) {
              toast.error("Resume must be 4 MB or smaller");
              return;
            }
            setBusy(true);
            const fd = new FormData();
            fd.set("openingId", openingId);
            for (const [k, v] of Object.entries(form)) fd.set(k, v);
            if (resume) fd.set("resume", resume);
            const res = await applyToJob(fd);
            setBusy(false);
            if (res.ok) setDone(true);
            else toast.error(res.error);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="a-fn">First name</Label>
            <Input id="a-fn" required value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-ln">Last name</Label>
            <Input id="a-ln" required value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-em">Email</Label>
            <Input id="a-em" type="email" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-ph">Phone (optional)</Label>
            <Input id="a-ph" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="a-resume">Resume (PDF or Word, optional)</Label>
            <Input
              id="a-resume"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setResume(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="a-cl">
              Tell us about yourself (experience, links, anything!)
            </Label>
            <Textarea id="a-cl" className="min-h-[120px]" value={form.coverLetter}
              onChange={(e) => setForm({ ...form, coverLetter: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={busy}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Submit application
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
