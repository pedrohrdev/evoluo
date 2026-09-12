import Link from "next/link";
import { Avatar } from "@/components/profile/avatar";
import { StreakFlame } from "@/components/streak/streak-flame";
import type { RankingEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";

// Nome e foto vêm na própria resposta do ranking (etapa 23). Antes, cada
// linha disparava um GET /profiles/:userId — o endpoint mais caro da API,
// que carrega todas as participações e metas do usuário — só para desenhar
// uma inicial, e descartava o avatarUrl que acabara de buscar. Um painel de
// 10 pessoas virava ~12 requisições; agora é zero.
export function RankingRow({ entry, highlight }: { entry: RankingEntry; highlight?: boolean }) {
  const name = entry.displayName ?? "Participante";

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
        <Avatar displayName={name} avatarUrl={entry.avatarUrl} className="size-8" textClassName="text-xs" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{name}</span>
        <StreakFlame value={entry.currentStreak} size="sm" className="shrink-0" />
        <span className="w-12 shrink-0 text-right text-sm tabular-nums text-ink-muted sm:w-16">
          {entry.totalPoints}
          <span className="hidden sm:inline"> pts</span>
        </span>
      </Link>
    </li>
  );
}
