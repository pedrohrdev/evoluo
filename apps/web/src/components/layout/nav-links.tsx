"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Gift, LayoutDashboard, ListChecks, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPendingSpecialGoalsCount } from "@/lib/api/special-goals";
import { useChallenge } from "@/lib/challenge/challenge-context";
import { cn } from "@/lib/cn";

// Quantas metas especiais esperam uma ação minha. Sem isto a funcionalidade
// era invisível: não havia badge, contador nem notificação, e quem recebia
// uma meta só descobria se abrisse a aba por conta própria.
function usePendingSpecialGoals(): number {
  const { participation } = useChallenge();
  const participantId = participation?.participantId;

  const { data } = useQuery({
    queryKey: ["special-goals-pending", participantId],
    queryFn: () => getPendingSpecialGoalsCount(participantId!),
    enabled: !!participantId,
    staleTime: 60_000,
  });

  return data?.pending ?? 0;
}

function useNavItems(challengeId: string) {
  const base = `/c/${challengeId}`;
  return [
    { href: base, label: "Painel", icon: LayoutDashboard, exact: true },
    { href: `${base}/ranking`, label: "Ranking", icon: Trophy },
    { href: `${base}/special-goals`, label: "Entre amigos", icon: Gift, badge: true },
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
  const pending = usePendingSpecialGoals();

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
            {item.badge && pending > 0 ? (
              <span className="ml-0.5 rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-on">
                {pending}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNavBar({ challengeId }: { challengeId: string }) {
  const pathname = usePathname();
  const items = useNavItems(challengeId);
  const pending = usePendingSpecialGoals();

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
            <span className="relative">
              <Icon className="size-5" aria-hidden />
              {item.badge && pending > 0 ? (
                <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-on">
                  {pending}
                </span>
              ) : null}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
