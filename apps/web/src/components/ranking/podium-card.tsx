import { Medal } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/profile/avatar";
import { Surface } from "@/components/ui/surface";
import type { RankingEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";

const MEDAL_TONE: Record<1 | 2 | 3, string> = {
  1: "text-[#e0b23a]",
  2: "text-ink-faint",
  3: "text-[#c2793c]",
};

function PodiumSlot({ entry }: { entry: RankingEntry }) {
  const tone = MEDAL_TONE[entry.position as 1 | 2 | 3] ?? "text-ink-faint";
  const name = entry.displayName ?? "Participante";

  return (
    <Link
      href={`/profiles/${entry.userId}`}
      className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-sm px-1 py-1 text-center transition-colors hover:bg-surface-2"
    >
      <Medal className={cn("size-4", tone)} aria-hidden />
      <Avatar displayName={name} avatarUrl={entry.avatarUrl} className="size-8" textClassName="text-xs" />
      <span className="w-full truncate text-xs font-medium text-ink">{name}</span>
      <span className="text-[11px] tabular-nums text-ink-muted">{entry.totalPoints} pts</span>
    </Link>
  );
}

// Card compacto com o pódio (1º-3º), pensado para caber logo abaixo dos
// stats do topo sem empurrar "Hoje" para baixo da dobra em telas pequenas
// (decisão confirmada com o usuário: foco em mobile). Reaproveita a mesma
// query de ranking do dashboard — nenhuma chamada extra.
export function PodiumCard({ entries }: { entries: RankingEntry[] }) {
  const top3 = entries.slice(0, 3);

  if (top3.length === 0) {
    return null;
  }

  return (
    <Surface className="flex items-stretch gap-1 p-2">
      {top3.map((entry) => (
        <PodiumSlot key={entry.participantId} entry={entry} />
      ))}
    </Surface>
  );
}
