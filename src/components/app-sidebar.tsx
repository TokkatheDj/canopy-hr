"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/config/nav";
import type { SessionUser } from "@/lib/authz";

export function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => i.show(user));

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-emerald-950 text-emerald-50">
      <Link
        href="/home"
        className="flex items-center gap-2 px-4 py-4 text-lg font-bold tracking-tight"
      >
        <Leaf className="size-6 text-emerald-400" />
        Canopy HR
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-emerald-800 font-medium text-white"
                  : "text-emerald-200/80 hover:bg-emerald-900 hover:text-white",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => i.show(user)).slice(0, 5);

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 flex border-t bg-background">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
              active ? "text-emerald-600 font-medium" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
