"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { RankingList } from "@/components/ranking/ranking-list";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { getRanking } from "@/lib/api/ranking";
import { useChallenge } from "@/lib/challenge/challenge-context";

export default function RankingPage() {
  const { challengeId, participation } = useChallenge();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ranking", challengeId],
    queryFn: () => getRanking(challengeId),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-2">
        <Trophy className="size-5 text-accent" aria-hidden />
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Ranking</h1>
          <p className="text-sm text-ink-muted">Streak atual → pontos → dias concluídos.</p>
        </div>
      </div>

      {isLoading ? <LoadingState label="Carregando ranking…" /> : null}
      {isError ? <ErrorState message="Não foi possível carregar o ranking." onRetry={() => void refetch()} /> : null}

      {data ? (
        <Surface className="p-2">
          <RankingList entries={data} ownParticipantId={participation?.participantId} />
        </Surface>
      ) : null}
    </div>
  );
}
