"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { GoalSummaryRow } from "@/components/goals/goal-summary-row";
import { RankingList } from "@/components/ranking/ranking-list";
import { StreakFlame } from "@/components/streak/streak-flame";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { getRanking } from "@/lib/api/ranking";
import { getTodayState } from "@/lib/api/records";
import type { RecordEntry } from "@/lib/api/types";
import { daysBetween, todayInSaoPaulo } from "@/lib/format/format";
import { useProfileParticipation } from "@/lib/profile/profile-participation-context";

// Contraparte somente-leitura de app/c/[challengeId]/page.tsx: mostra as
// metas e o "hoje" de OUTRO participante (dados vindos de participation,
// resolvida pelo perfil visitado, nunca pelo usuário logado). Sem
// GoalRecordCard (input/botão) — usa GoalSummaryRow, e não há links de
// "Configurar metas"/"gerenciar", já que esta tela nunca edita nada.
export default function ProfileChallengeDashboardPage() {
  const { participation } = useProfileParticipation();
  const participantId = participation!.participantId;
  const challengeId = participation!.challengeId;

  const todayQuery = useQuery({
    queryKey: ["today", participantId],
    queryFn: () => getTodayState(participantId),
  });
  const rankingQuery = useQuery({
    queryKey: ["ranking", challengeId],
    queryFn: () => getRanking(challengeId),
  });

  if (todayQuery.isLoading) return <LoadingState label="Carregando painel…" />;
  if (todayQuery.isError) {
    return <ErrorState message="Não foi possível carregar o painel." onRetry={() => void todayQuery.refetch()} />;
  }

  const goals = participation!.goals;
  const daily = goals.filter((g) => g.periodType === "daily");
  const secondaryGoals = goals.filter((g) => g.periodType !== "daily");
  const today = todayQuery.data!;

  function findRecord(list: RecordEntry[], goalId: string) {
    return list.find((r) => r.goalId === goalId);
  }

  const position = rankingQuery.data?.find((e) => e.participantId === participantId)?.position;

  const dayNumber = Math.min(
    participation!.durationDays,
    Math.max(1, daysBetween(participation!.startDate, todayInSaoPaulo()) + 1),
  );

  return (
    <div className="flex flex-col gap-8">
      <Surface className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
        <HeroStat
          label="Streak atual"
          value={<StreakFlame value={participation!.currentStreak} size="lg" />}
          hint={`recorde: ${participation!.longestStreak}`}
        />
        <HeroStat label="Pontos" value={participation!.totalPoints} hint="total no desafio" />
        <HeroStat label="Dia do desafio" value={`${dayNumber}/${participation!.durationDays}`} />
        <HeroStat label="Ranking" value={position ? `${position}º` : "—"} />
      </Surface>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Hoje</h2>
        {daily.length === 0 ? (
          <Surface className="p-5 text-sm text-ink-muted">Metas diárias ainda não configuradas.</Surface>
        ) : (
          <div className="flex flex-col gap-2">
            {daily.map((goal) => (
              <GoalSummaryRow key={goal.id} goal={goal} record={findRecord(today.daily, goal.id)} />
            ))}
          </div>
        )}
      </section>

      {secondaryGoals.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">Metas de período</h2>
          <div className="flex flex-col gap-2">
            {secondaryGoals.map((goal) => {
              const source = { weekly: today.weekly, monthly: today.monthly, challenge: today.challenge }[
                goal.periodType as "weekly" | "monthly" | "challenge"
              ];
              return <GoalSummaryRow key={goal.id} goal={goal} record={findRecord(source, goal.id)} />;
            })}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold text-ink">
            <Trophy className="size-4 text-accent" aria-hidden />
            Ranking
          </h2>
          <Badge tone="neutral">{rankingQuery.data?.length ?? 0} participantes</Badge>
        </div>
        <Surface className="p-2">
          {rankingQuery.isLoading ? (
            <LoadingState label="Carregando ranking…" />
          ) : (
            <RankingList entries={rankingQuery.data ?? []} ownParticipantId={participantId} limit={5} />
          )}
        </Surface>
      </section>
    </div>
  );
}
