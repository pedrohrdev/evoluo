import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import type { RankingEntry } from "@/lib/api/types";
import { RankingRow } from "./ranking-row";

// Ordem já vem definida pelo backend (etapa 9): streak atual -> pontos ->
// dias concluídos -> participant_id. O maior streak histórico nunca entra
// aqui — não é reexibido nem usado para nada nesta lista.
export function RankingList({
  entries,
  ownParticipantId,
  limit,
}: {
  entries: RankingEntry[];
  ownParticipantId?: string;
  limit?: number;
}) {
  if (entries.length === 0) {
    return <EmptyState icon={Trophy} title="Ninguém no ranking ainda" description="Assim que alguém pontuar, aparece aqui." />;
  }

  const visible = limit ? entries.slice(0, limit) : entries;

  return (
    <ul className="flex flex-col gap-0.5">
      {visible.map((entry) => (
        <RankingRow key={entry.participantId} entry={entry} highlight={entry.participantId === ownParticipantId} />
      ))}
    </ul>
  );
}
