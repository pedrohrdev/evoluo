"use client";

import { BarChart3, LayoutDashboard, ListChecks, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavLinks({ challengeId }: { challengeId: string }) {
  const pathname = usePathname();
  const base = `/c/${challengeId}`;

  const items = [
    { href: base, label: "Painel", icon: LayoutDashboard, exact: true },
    { href: `${base}/ranking`, label: "Ranking", icon: Trophy },
    { href: `${base}/history`, label: "Histórico", icon: ListChecks },
    { href: `${base}/analytics`, label: "Análises", icon: BarChart3 },
  ];

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors duration-150",
              active ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-1 hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
