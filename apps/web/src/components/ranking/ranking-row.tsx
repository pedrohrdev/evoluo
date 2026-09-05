"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Skeleton } from "@/components/ui/feedback";
import { StreakFlame } from "@/components/streak/streak-flame";
import { getProfile, profileQueryKey } from "@/lib/api/profiles";
import type { RankingEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";

// Resolve nome/avatar por linha (a API de ranking não devolve displayName —
// é leitura pública de qualquer perfil, GET /profiles/:userId). Aceitável
// no volume esperado de um desafio entre amigos (ver
// docs/arquitetura-tecnica.md seção 7). Usa a mesma chave de cache da tela
// de perfil e do bootstrap do desafio ativo (profileQueryKey) — se algum
// desses já buscou este userId, o React Query reaproveita em vez de
// refazer a chamada (etapa 18 "Performance").
export function RankingRow({ entry, highlight }: { entry: RankingEntry; highlight?: boolean }) {
  const { data: profile } = useQuery({
    queryKey: profileQueryKey(entry.userId),
    queryFn: () => getProfile(entry.userId),
    staleTime: 5 * 60_000,
  });

  return (
    <li>
      <Link
        href={`/profiles/${entry.userId}`}
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-2 sm:gap-3 sm:px-3",
          highlight && "bg-accent-soft",
        )}
      >
        <span
          className={cn(
            "w-5 shrink-0 text-center font-display text-sm font-semibold tabular-nums sm:w-6",
            entry.position <= 3 ? "text-accent" : "text-ink-faint",
          )}
        >
          {entry.position}
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-xs font-semibold text-ink">
          {profile ? profile.displayName.charAt(0).toUpperCase() : <Skeleton className="size-4 rounded-full" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {profile?.displayName ?? "…"}
        </span>
        <StreakFlame value={entry.currentStreak} size="sm" className="shrink-0" />
        <span className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-muted sm:w-16">
          {entry.totalPoints}
          <span className="hidden sm:inline"> pts</span>
        </span>
      </Link>
    </li>
  );
}
