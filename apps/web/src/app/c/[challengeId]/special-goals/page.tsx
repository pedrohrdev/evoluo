"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus } from "lucide-react";
import { useState } from "react";
import { CreateSpecialGoalModal } from "@/components/special-goals/create-special-goal-modal";
import { SpecialGoalRow } from "@/components/special-goals/special-goal-row";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { ApiError } from "@/lib/api/client";
import { getRanking } from "@/lib/api/ranking";
import { cancelSpecialGoal, completeSpecialGoal, listSpecialGoals } from "@/lib/api/special-goals";
import { useChallenge } from "@/lib/challenge/challenge-context";
import { useToast } from "@/lib/toast/toast-context";

// Metas especiais são puramente sociais — nunca aparecem em streak, pontos
// ou ranking (CLAUDE.md seção 2 "Outras regras já confirmadas"). Esta tela
// só lista e permite criar/cumprir/cancelar; nenhum dado aqui alimenta
// nenhuma outra tela.
export default function SpecialGoalsPage() {
  const { challengeId, participation } = useChallenge();
  const participantId = participation?.participantId;
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const rankingQuery = useQuery({
    queryKey: ["ranking", challengeId],
    queryFn: () => getRanking(challengeId),
  });

  const goalsQuery = useQuery({
    queryKey: ["special-goals", challengeId],
    queryFn: () => listSpecialGoals(challengeId),
  });

  const participants = rankingQuery.data ?? [];

  // O ranking já traz displayName desde a etapa 23 — antes esta tela
  // disparava um GET /profiles/:id por participante só para resolver nomes.
  const nameByParticipantId = new Map<string, string>();
  participants.forEach((entry) => {
    nameByParticipantId.set(entry.participantId, entry.displayName ?? "Participante");
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["special-goals", challengeId] });
  }

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeSpecialGoal(id),
    onSuccess: () => {
      notify("Meta especial marcada como cumprida.", "success");
      invalidate();
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : "Não foi possível concluir.", "danger"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelSpecialGoal(id),
    onSuccess: () => {
      notify("Meta especial cancelada.", "success");
      invalidate();
    },
    onError: (err) => notify(err instanceof ApiError ? err.message : "Não foi possível cancelar.", "danger"),
  });

  const isLoading = rankingQuery.isLoading || goalsQuery.isLoading;
  const isError = rankingQuery.isError || goalsQuery.isError;

  const candidates = participants
    .filter((entry) => entry.participantId !== participantId)
    .map((entry) => ({ participantId: entry.participantId, displayName: nameByParticipantId.get(entry.participantId) ?? "…" }));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        icon={Gift}
        title="Metas especiais"
        description="Uma pessoa atribui, a outra cumpre quando quiser. Não vale ponto, não mexe no streak nem no ranking — é só entre vocês."
      />

      <div className="mb-4 flex justify-end">
        <Button size="sm" disabled={candidates.length === 0} onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Nova meta especial
        </Button>
      </div>

      {isLoading ? <LoadingState label="Carregando metas especiais…" /> : null}
      {isError ? (
        <ErrorState
          message="Não foi possível carregar as metas especiais."
          onRetry={() => {
            void rankingQuery.refetch();
            void goalsQuery.refetch();
          }}
        />
      ) : null}

      {goalsQuery.data ? (
        goalsQuery.data.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="Nenhuma meta especial ainda"
            description="Atribua uma tarefa avulsa para outro participante deste desafio."
          />
        ) : (
          <Surface className="p-2">
            <ul className="flex flex-col gap-2">
              {goalsQuery.data.map((goal) => (
                <SpecialGoalRow
                  key={goal.id}
                  goal={goal}
                  fromName={nameByParticipantId.get(goal.fromParticipantId) ?? "Participante"}
                  toName={nameByParticipantId.get(goal.toParticipantId) ?? "Participante"}
                  canComplete={goal.status === "pending" && goal.toParticipantId === participantId}
                  canCancel={goal.status === "pending" && goal.fromParticipantId === participantId}
                  onComplete={() => completeMutation.mutate(goal.id)}
                  onCancel={() => cancelMutation.mutate(goal.id)}
                  completing={completeMutation.isPending && completeMutation.variables === goal.id}
                  cancelling={cancelMutation.isPending && cancelMutation.variables === goal.id}
                />
              ))}
            </ul>
          </Surface>
        )
      ) : null}

      <CreateSpecialGoalModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        challengeId={challengeId}
        candidates={candidates}
        onCreated={invalidate}
      />
    </div>
  );
}
