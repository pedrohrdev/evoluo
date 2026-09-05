"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { RankingList } from "@/components/ranking/ranking-list";
import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader icon={Trophy} title="Ranking" description="Streak atual → pontos → dias concluídos." />

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
