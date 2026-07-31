"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, LogOut, UserRound } from "lucide-react";
import type { SessionUser } from "@/lib/authz";

export function AppTopbar({
  user,
  unreadCount,
}: {
  user: SessionUser;
  unreadCount: number;
}) {
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">
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
            <DropdownMenuLabel className="truncate">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs font-normal text-muted-foreground truncate">
                {user.email}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/my-info" />}>
              <UserRound className="size-4" /> My Info
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
