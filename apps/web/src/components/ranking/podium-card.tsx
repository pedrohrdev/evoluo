import { Medal } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/profile/avatar";
import type { RankingEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";

const MEDAL_TONE: Record<1 | 2 | 3, string> = {
  1: "text-[#e0b23a]",
  2: "text-ink-faint",
  3: "text-[#c2793c]",
};

// Ordem visual do pódio: 1º ao centro (mais alto), 2º à esquerda, 3º à
// direita — DOM continua na ordem de posição, isso só reordena o layout.
const PODIUM_ORDER: Record<1 | 2 | 3, string> = {
  1: "order-2",
  2: "order-1",
  3: "order-3",
};

function PodiumSlot({ entry }: { entry: RankingEntry }) {
  const position = entry.position as 1 | 2 | 3;
  const tone = MEDAL_TONE[position] ?? "text-ink-faint";
  const order = PODIUM_ORDER[position] ?? "";
  const isFirst = position === 1;
  const name = entry.displayName ?? "Participante";

  return (
    <Link
      href={`/profiles/${entry.userId}`}
      className={cn(
        "flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 rounded-md border border-line px-1 text-center transition-colors hover:bg-surface-3",
        isFirst ? "bg-surface-2 pb-3 pt-2" : "bg-surface-1 pb-2 pt-1.5",
        order,
      )}
    >
      <Medal className={cn(isFirst ? "size-5" : "size-4", tone)} aria-hidden />
      <Avatar
        displayName={name}
        avatarUrl={entry.avatarUrl}
        className={isFirst ? "size-10" : "size-8"}
        textClassName={isFirst ? "text-sm" : "text-xs"}
      />
      <span className="w-full truncate text-xs font-medium text-ink">{name}</span>
      <span className={cn("tabular-nums text-ink-muted", isFirst ? "text-xs" : "text-[11px]")}>
        {entry.totalPoints} pts
      </span>
    </Link>
  );
}

// Card compacto com o pódio (1º-3º), pensado para caber logo abaixo dos
// stats do topo sem empurrar "Hoje" para baixo da dobra em telas pequenas
// (decisão confirmada com o usuário: foco em mobile). Reaproveita a mesma
// query de ranking do dashboard — nenhuma chamada extra. Layout imita o
// pódio clássico: 1º centralizado e mais alto, 2º à esquerda mais baixo,
// 3º à direita mais baixo ainda (alinhamento pela base via items-end).
export function PodiumCard({ entries }: { entries: RankingEntry[] }) {
  const top3 = entries.slice(0, 3);

  if (top3.length === 0) {
    return null;
  }

  return (
    <div className="flex items-end gap-1.5">
      {top3.map((entry) => (
        <PodiumSlot key={entry.participantId} entry={entry} />
      ))}
    </div>
  );
}
