"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChallengeFeed } from "@/components/challenge/challenge-feed";
import { ChallengeResult } from "@/components/challenge/challenge-result";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { GoalFormModal } from "@/components/goals/goal-form-modal";
import { GoalSummaryRow } from "@/components/goals/goal-summary-row";
import { PeriodGoalModal } from "@/components/goals/period-goal-modal";
import { PodiumCard } from "@/components/ranking/podium-card";
import { PushToggle } from "@/components/settings/push-toggle";
import { StreakFlame } from "@/components/streak/streak-flame";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/feedback";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Surface } from "@/components/ui/surface";
import { listGoals } from "@/lib/api/goals";
import { getRanking } from "@/lib/api/ranking";
import { getTodayState } from "@/lib/api/records";
import { getStreak } from "@/lib/api/streak";
import type { Goal, GoalPeriod, RecordEntry } from "@/lib/api/types";
import { useChallenge } from "@/lib/challenge/challenge-context";
import { useStreakFeedback } from "@/lib/challenge/use-streak-feedback";
import { daysBetween, formatDate, todayInSaoPaulo } from "@/lib/format/format";

export default function DashboardPage() {
  const { participation, dashboardBundle } = useChallenge();
  const participantId = participation?.participantId;
  const challengeId = participation?.challengeId;
  const queryClient = useQueryClient();
  // Meta (de qualquer periodicidade, diária inclusive — regra revisada: o
  // check-in único por dia foi revertido) sendo registrada agora. null =
  // modal fechado. Ver period-goal-modal.tsx.
  const [recordingGoal, setRecordingGoal] = useState<Goal | null>(null);
  // Meta sendo editada (título/tipo/alvo/importância) — diferente de
  // recordingGoal, que só lança um valor do dia. Ver goal-form-modal.tsx.
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // `initialData` a partir do que ChallengeProvider já buscou junto do
  // perfil (etapa de performance — CLAUDE.md não muda): goals sempre vêm
  // de brinde em qualquer participação; today/streak/ranking só quando
  // este é o desafio padrão (dashboardBundle), o único que o backend
  // calcula de antemão. `staleTime` curto evita um refetch imediato
  // silencioso jogando fora essa economia, sem enfraquecer as invalidações
  // explícitas (check-in, entrar/sair) — invalidateQueries sempre refaz a
  // busca na hora, independente de staleTime.
  const matchedBundle = dashboardBundle && dashboardBundle.participantId === participantId ? dashboardBundle : undefined;

  const goalsQuery = useQuery({
    queryKey: ["goals", participantId],
    queryFn: () => listGoals(participantId!),
    enabled: !!participantId,
    initialData: participation?.goals,
    staleTime: 15_000,
  });
  const todayQuery = useQuery({
    queryKey: ["today", participantId],
    queryFn: () => getTodayState(participantId!),
    enabled: !!participantId,
    initialData: matchedBundle?.today,
    staleTime: 15_000,
  });
  const streakQuery = useQuery({
    queryKey: ["streak", participantId],
    queryFn: () => getStreak(participantId!),
    enabled: !!participantId,
    initialData: matchedBundle?.streak,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const rankingQuery = useQuery({
    queryKey: ["ranking", challengeId],
    queryFn: () => getRanking(challengeId!),
    enabled: !!challengeId,
    initialData: matchedBundle?.ranking,
    staleTime: 15_000,
  });

  useStreakFeedback(
    participantId,
    streakQuery.data
      ? {
          currentStreak: streakQuery.data.currentStreak,
          longestStreak: streakQuery.data.longestStreak,
          dayCompletedToday: streakQuery.data.today?.dayCompleted ?? false,
        }
      : undefined,
  );

  if (!participation || goalsQuery.isLoading || todayQuery.isLoading || streakQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (goalsQuery.isError || todayQuery.isError || streakQuery.isError) {
    return <ErrorState message="Não foi possível carregar o painel." onRetry={() => window.location.reload()} />;
  }

  const goals = goalsQuery.data ?? [];
  const daily = goals.filter((g) => g.periodType === "daily");
  const weekly = goals.find((g) => g.periodType === "weekly");
  const monthly = goals.find((g) => g.periodType === "monthly");
  const duration = goals.find((g) => g.periodType === "challenge");
  const secondaryGoals = [weekly, monthly, duration].filter((g): g is NonNullable<typeof g> => !!g);

  const today = todayQuery.data!;
  const streak = streakQuery.data!;
  // Reflete o progresso reativo do dia (day_results.completed_goals_count),
  // atualizado a cada registro — não é mais um estado "tentativo" que só um
  // check-in decidiria (regra revisada: check-in único por dia foi
  // revertido, streak/pontos reagem em tempo real).
  const completedToday = streak.today?.completedGoalsCount ?? 0;
  const dailyConfigured = daily.length >= 3;

  // Desafio pode ser criado com start_date no futuro (ex.: combinar com os
  // amigos de começar só na segunda) — RecordsService já rejeita qualquer
  // registro/check-in antes disso (backend); aqui é só refletir esse
  // estado na UI em vez de mostrar "Dia 1" e um botão de check-in que
  // falharia ao ser clicado.
  // Tudo em America/Sao_Paulo, o mesmo relógio do fechamento no servidor —
  // com a data UTC do navegador, o contador adiantava um dia entre 21h e a
  // meia-noite, e na véspera do início o painel liberava um check-in que o
  // backend recusava.
  // `today` (acima) é o ESTADO do dia vindo da API; esta é a DATA de hoje.
  const todayDate = todayInSaoPaulo();
  const daysUntilStart = daysBetween(todayDate, participation.startDate);
  const hasStarted = daysUntilStart <= 0;
  const hasEnded = daysBetween(todayDate, participation.endDate) < 0;

  const dayNumber = Math.min(
    participation.durationDays,
    Math.max(1, daysBetween(participation.startDate, todayDate) + 1),
  );

  // Desafio terminado: o painel de "hoje" não faz mais sentido — vira a
  // tela de resultado. Ver challenge-result.tsx.
  if (hasEnded) {
    return <ChallengeResult participation={participation} challengeId={challengeId!} />;
  }

  const ownPosition = rankingQuery.data?.find((e) => e.participantId === participantId)?.position;

  const recordsByGoalId = new Map<string, RecordEntry>();
  for (const list of [today.daily, today.weekly, today.monthly, today.challenge]) {
    for (const record of list) recordsByGoalId.set(record.goalId, record);
  }

  function handleRecorded(period: GoalPeriod, record: RecordEntry) {
    queryClient.setQueryData<typeof today>(["today", participantId], (current) => {
      if (!current) return current;
      const list = current[period];
      const withoutOld = list.filter((r) => r.goalId !== record.goalId);
      return { ...current, [period]: [...withoutOld, record] };
    });
    void queryClient.invalidateQueries({ queryKey: ["streak", participantId] });
    void queryClient.invalidateQueries({ queryKey: ["ranking", challengeId] });
  }

  function handleGoalSaved() {
    void queryClient.invalidateQueries({ queryKey: ["goals", participantId] });
  }

  return (
    <div className="flex flex-col gap-8">
      <Surface className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
        <HeroStat label="Streak atual" value={<StreakFlame value={streak.currentStreak} size="lg" />} hint={`recorde: ${streak.longestStreak}`} />
        <HeroStat label="Pontos" value={participation.totalPoints} hint="total no desafio" />
        <HeroStat
          label={hasStarted ? "Dia do desafio" : "Começa em"}
          value={hasStarted ? `${dayNumber}/${participation.durationDays}` : `${daysUntilStart}d`}
          hint={hasStarted ? undefined : formatDate(participation.startDate)}
        />
        <HeroStat
          label="Ranking"
          value={ownPosition ? `${ownPosition}º` : "—"}
          hint={
            <Link href={`/c/${challengeId}/ranking`} className="inline-flex items-center gap-1 text-accent hover:underline">
              ver completo <ArrowRight className="size-3" />
            </Link>
          }
        />
      </Surface>

      {rankingQuery.data && rankingQuery.data.length > 0 ? <PodiumCard entries={rankingQuery.data} /> : null}

      {hasStarted ? <PushToggle /> : null}

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Hoje</h2>
            <p className="text-sm text-ink-muted">
              {!hasStarted
                ? daysUntilStart === 1
                  ? "Começa amanhã"
                  : `Começa em ${daysUntilStart} dias`
                : `${completedToday}/3 metas diárias concluídas`}
            </p>
          </div>
          {!dailyConfigured ? (
            <Link
              href={`/c/${challengeId}/setup`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <Settings2 className="size-4" aria-hidden />
              Configurar metas diárias
            </Link>
          ) : (
            <div className="flex shrink-0 items-center gap-3 sm:self-start">
              {!hasStarted ? <Badge tone="neutral">Ainda não começou</Badge> : null}
              <Link
                href={`/c/${challengeId}/setup`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
              >
                <Settings2 className="size-4" aria-hidden />
                editar
              </Link>
            </div>
          )}
        </div>
        {hasStarted ? (
          <ProgressBar value={(completedToday / 3) * 100} tone={completedToday === 3 ? "success" : "accent"} className="mb-4" />
        ) : null}

        {!dailyConfigured ? (
          <Surface className="p-5 text-sm text-ink-muted">
            Configure as 3 metas diárias obrigatórias para começar a acompanhar seu streak.
          </Surface>
        ) : !hasStarted ? (
          <Surface className="p-5 text-sm text-ink-muted">
            Esse desafio começa {daysUntilStart === 1 ? "amanhã" : `em ${daysUntilStart} dias`}, no dia{" "}
            {formatDate(participation.startDate)} — dá pra registrar a partir daí. Suas metas já estão configuradas.
          </Surface>
        ) : (
          <div className="flex flex-col gap-2">
            {daily.map((goal) => (
              <GoalSummaryRow
                key={goal.id}
                goal={goal}
                record={recordsByGoalId.get(goal.id)}
                onRecord={() => setRecordingGoal(goal)}
                onEdit={() => setEditingGoal(goal)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">No desafio</h2>
        <ChallengeFeed challengeId={challengeId!} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Metas de período</h2>
          <Link href={`/c/${challengeId}/setup`} className="text-sm font-medium text-ink-muted hover:text-ink">
            gerenciar
          </Link>
        </div>
        {secondaryGoals.length === 0 ? (
          <Surface className="p-5 text-sm text-ink-muted">
            Nenhuma meta semanal, mensal ou de duração configurada — elas são opcionais.
          </Surface>
        ) : (
          <div className="flex flex-col gap-2">
            {secondaryGoals.map((goal) => (
              <GoalSummaryRow
                key={goal.id}
                goal={goal}
                record={recordsByGoalId.get(goal.id)}
                onRecord={hasStarted && !hasEnded ? () => setRecordingGoal(goal) : undefined}
                onEdit={() => setEditingGoal(goal)}
                challengeDurationDays={participation.durationDays}
              />
            ))}
          </div>
        )}
      </section>

      <PeriodGoalModal
        goal={recordingGoal}
        record={recordingGoal ? recordsByGoalId.get(recordingGoal.id) : undefined}
        onOpenChange={(open) => !open && setRecordingGoal(null)}
        onRecorded={handleRecorded}
      />

      {editingGoal ? (
        <GoalFormModal
          open
          onOpenChange={(open) => !open && setEditingGoal(null)}
          participantId={participantId!}
          periodType={editingGoal.periodType}
          existingGoal={editingGoal}
          onSaved={handleGoalSaved}
        />
      ) : null}
    </div>
  );
}
