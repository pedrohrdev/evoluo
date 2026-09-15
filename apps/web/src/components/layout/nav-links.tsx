"use client";

import { BarChart3, LayoutDashboard, ListChecks, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

function useNavItems(challengeId: string) {
  const base = `/c/${challengeId}`;
  return [
    { href: base, label: "Painel", icon: LayoutDashboard, exact: true },
    { href: `${base}/ranking`, label: "Ranking", icon: Trophy },
    { href: `${base}/history`, label: "Histórico", icon: ListChecks },
    { href: `${base}/analytics`, label: "Análises", icon: BarChart3 },
  ];
}

// Nav de topo, para telas médias em diante — ícone + rótulo lado a lado.
// Em mobile o mesmo conjunto de links vira a BottomNavBar (barra fixa,
// mais confortável para navegação com o polegar).
export function NavLinks({ challengeId }: { challengeId: string }) {
  const pathname = usePathname();
  const items = useNavItems(challengeId);

  return (
    <nav className="hidden items-center gap-1 sm:flex">
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
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNavBar({ challengeId }: { challengeId: string }) {
  const pathname = usePathname();
  const items = useNavItems(challengeId);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface-0/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      aria-label="Navegação principal"
    >
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors duration-150",
              active ? "text-accent" : "text-ink-faint",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
