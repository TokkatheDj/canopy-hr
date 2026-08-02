"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, LogOut, UserRound, Loader2, ShieldCheck, Users, UserRoundCog } from "lucide-react";
import type { SessionUser } from "@/lib/authz";

// Demo-only quick role switcher (same shared accounts as the login page)
const DEMO_ROLES = [
  { label: "Admin (HR)", email: "admin@canopyhr.demo", icon: ShieldCheck },
  { label: "Manager", email: "manager@canopyhr.demo", icon: Users },
  { label: "Employee", email: "employee@canopyhr.demo", icon: UserRound },
] as const;

export function AppTopbar({
  user,
  unreadCount,
}: {
  user: SessionUser;
  unreadCount: number;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function switchRole(email: string) {
    setSwitching(email);
    const res = await signIn("credentials", {
      email,
      password: "canopy-demo",
      redirect: false,
    });
    setSwitching(null);
    if (!res?.error) {
      router.push("/home");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2 md:hidden text-emerald-700 font-bold">
        Canopy HR
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="hidden sm:inline-flex capitalize text-muted-foreground"
        >
          {user.role.toLowerCase()}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          nativeButton={false}
          render={<Link href="/inbox" aria-label="Inbox" />}
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="rounded-full"
          >
            <Avatar className="size-8">
              <AvatarImage src={user.image ?? undefined} alt="" />
              <AvatarFallback className="bg-emerald-100 text-emerald-800 text-xs font-semibold">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">
                <div className="font-medium">{user.name}</div>
                <div className="text-xs font-normal text-muted-foreground truncate">
                  {user.email}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/my-info" />}>
              <UserRound className="size-4" /> My Info
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <UserRoundCog className="size-3.5" /> Switch demo view
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            {DEMO_ROLES.map((r) => (
              <DropdownMenuItem
                key={r.email}
                disabled={user.email === r.email || switching !== null}
                onClick={() => switchRole(r.email)}
              >
                {switching === r.email ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <r.icon className="size-4" />
                )}
                {r.label}
                {user.email === r.email && (
                  <span className="ml-auto text-xs text-muted-foreground">current</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
