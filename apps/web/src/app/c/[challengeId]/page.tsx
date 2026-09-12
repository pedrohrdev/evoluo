"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ClipboardCheck, Settings2, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { CheckInModal } from "@/components/goals/check-in-modal";
import { GoalSummaryRow } from "@/components/goals/goal-summary-row";
import { PodiumCard } from "@/components/ranking/podium-card";
import { RankingList } from "@/components/ranking/ranking-list";
import { StreakFlame } from "@/components/streak/streak-flame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Surface } from "@/components/ui/surface";
import { listGoals } from "@/lib/api/goals";
import { getRanking } from "@/lib/api/ranking";
import { getTodayState } from "@/lib/api/records";
import { getStreak } from "@/lib/api/streak";
import type { GoalPeriod, RecordEntry, TodayState } from "@/lib/api/types";
import { useChallenge } from "@/lib/challenge/challenge-context";
import { useStreakFeedback } from "@/lib/challenge/use-streak-feedback";
import { daysBetween, formatDate } from "@/lib/format/format";

export default function DashboardPage() {
  const { participation } = useChallenge();
  const participantId = participation?.participantId;
  const challengeId = participation?.challengeId;
  const queryClient = useQueryClient();
  const [checkInOpen, setCheckInOpen] = useState(false);

  const goalsQuery = useQuery({
    queryKey: ["goals", participantId],
    queryFn: () => listGoals(participantId!),
    enabled: !!participantId,
  });
  const todayQuery = useQuery({
    queryKey: ["today", participantId],
    queryFn: () => getTodayState(participantId!),
    enabled: !!participantId,
  });
  const streakQuery = useQuery({
    queryKey: ["streak", participantId],
    queryFn: () => getStreak(participantId!),
    enabled: !!participantId,
    refetchInterval: 60_000,
  });
  const rankingQuery = useQuery({
    queryKey: ["ranking", challengeId],
    queryFn: () => getRanking(challengeId!),
    enabled: !!challengeId,
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
    return <LoadingState label="Carregando seu painel…" />;
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
  const checkInGoals = [...daily, ...secondaryGoals];

  const today = todayQuery.data!;
  const streak = streakQuery.data!;
  const completedToday = streak.today?.completedGoalsCount ?? 0;
  const dailyConfigured = daily.length >= 3;
  // Só o check_in_daily_period (instantâneo) ou o job noturno de quem não
  // fez check-in marcam closed=true para hoje — nos dois casos o dia já
  // está decidido, então o botão de check-in some até amanhã.
  const checkedInToday = streak.today?.closed ?? false;

  // Desafio pode ser criado com start_date no futuro (ex.: combinar com os
  // amigos de começar só na segunda) — RecordsService já rejeita qualquer
  // registro/check-in antes disso (backend); aqui é só refletir esse
  // estado na UI em vez de mostrar "Dia 1" e um botão de check-in que
  // falharia ao ser clicado.
  const daysUntilStart = daysBetween(new Date().toISOString(), participation.startDate);
  const hasStarted = daysUntilStart <= 0;

  const dayNumber = Math.min(
    participation.durationDays,
    Math.max(1, daysBetween(participation.startDate, new Date().toISOString()) + 1),
  );

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

  // O check-in diário já fecha o dia no servidor (streak/pontos
  // instantâneos) — troca o "hoje" pelo estado fresco devolvido pelo
  // próprio check-in, e invalida streak/ranking pra refletir o
  // fechamento (currentStreak, totalPoints e a posição no ranking podem
  // ter mudado).
  function handleDailyCheckedIn(freshToday: TodayState) {
    queryClient.setQueryData(["today", participantId], freshToday);
    void queryClient.invalidateQueries({ queryKey: ["streak", participantId] });
    void queryClient.invalidateQueries({ queryKey: ["ranking", challengeId] });
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
          ) : !hasStarted ? (
            <Badge tone="neutral" className="shrink-0 sm:self-start">
              Ainda não começou
            </Badge>
          ) : checkedInToday ? (
            <Badge tone="success" className="shrink-0 sm:self-start">
              <ClipboardCheck className="size-3.5" aria-hidden />
              Check-in de hoje concluído
            </Badge>
          ) : (
            <Button size="sm" onClick={() => setCheckInOpen(true)} className="shrink-0 sm:self-start">
              <ClipboardCheck className="size-4" aria-hidden />
              Fazer check-in
            </Button>
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
            {formatDate(participation.startDate)} — o check-in libera a partir daí. Suas metas já estão configuradas.
          </Surface>
        ) : (
          <div className="flex flex-col gap-2">
            {daily.map((goal) => (
              <GoalSummaryRow key={goal.id} goal={goal} record={recordsByGoalId.get(goal.id)} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
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
                <GoalSummaryRow key={goal.id} goal={goal} record={recordsByGoalId.get(goal.id)} />
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-2">
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

      {dailyConfigured && hasStarted && !checkedInToday ? (
        <CheckInModal
          open={checkInOpen}
          onOpenChange={setCheckInOpen}
          participantId={participantId!}
          goals={checkInGoals}
          recordsByGoalId={recordsByGoalId}
          onRecorded={handleRecorded}
          onDailyCheckedIn={handleDailyCheckedIn}
        />
      ) : null}
    </div>
  );
}
