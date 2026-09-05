"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Skeleton } from "@/components/ui/feedback";
import { StreakFlame } from "@/components/streak/streak-flame";
import { getProfile } from "@/lib/api/profiles";
import type { RankingEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";

// Resolve nome/avatar por linha (a API de ranking não devolve displayName —
// é leitura pública de qualquer perfil, GET /profiles/:userId). Aceitável
// no volume esperado de um desafio entre amigos (ver
// docs/arquitetura-tecnica.md seção 7).
export function RankingRow({ entry, highlight }: { entry: RankingEntry; highlight?: boolean }) {
  const { data: profile } = useQuery({
    queryKey: ["profile-name", entry.userId],
    queryFn: () => getProfile(entry.userId),
    staleTime: 5 * 60_000,
  });

  return (
    <li>
      <Link
        href={`/profiles/${entry.userId}`}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2",
          highlight && "bg-accent-soft",
        )}
      >
        <span
          className={cn(
            "w-6 shrink-0 text-center font-display text-sm font-semibold tabular-nums",
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
        <StreakFlame value={entry.currentStreak} size="sm" />
        <span className="w-16 shrink-0 text-right text-sm tabular-nums text-ink-muted">{entry.totalPoints} pts</span>
      </Link>
    </li>
  );
}
