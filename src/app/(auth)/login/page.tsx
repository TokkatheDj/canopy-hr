"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, ShieldCheck, Users, UserRound, Loader2 } from "lucide-react";

const DEMO_ACCOUNTS = [
  {
    role: "Admin (HR)",
    email: "admin@canopyhr.demo",
    description: "Full access — run payroll, manage hiring, settings, reports",
    icon: ShieldCheck,
  },
  {
    role: "Manager",
    email: "manager@canopyhr.demo",
    description: "Approve time off & timesheets, review your team",
    icon: Users,
  },
  {
    role: "Employee",
    email: "employee@canopyhr.demo",
    description: "Self-service — request PTO, view pay stubs, enroll in benefits",
    icon: UserRound,
  },
] as const;

const DEMO_PASSWORD = "canopy-demo";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function doLogin(loginEmail: string, loginPassword: string, key: string) {
    setBusy(key);
    setError(null);
    const res = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password.");
      setBusy(null);
    } else {
      router.push(params.get("callbackUrl") ?? "/home");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950 dark:to-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <Leaf className="size-8" />
            <span className="text-3xl font-bold tracking-tight">Canopy HR</span>
          </div>
          <p className="text-muted-foreground text-sm">
            The complete HR platform demo — pick a role to explore
          </p>
        </div>

        <div className="space-y-3">
          {DEMO_ACCOUNTS.map((acct) => (
            <Card
              key={acct.email}
              className="cursor-pointer transition hover:border-emerald-500 hover:shadow-md py-0"
              onClick={() => doLogin(acct.email, DEMO_PASSWORD, acct.email)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="rounded-full bg-emerald-100 dark:bg-emerald-900 p-2.5 text-emerald-700 dark:text-emerald-300">
                  {busy === acct.email ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <acct.icon className="size-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">Explore as {acct.role}</div>
                  <div className="text-xs text-muted-foreground">
                    {acct.description}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              or sign in with email
            </span>
          </div>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            doLogin(email, password, "form");
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-emerald-700 hover:bg-emerald-800"
            disabled={busy !== null}
          >
            {busy === "form" ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Demo application — all data is fictional. Not affiliated with any
          commercial HR product.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
