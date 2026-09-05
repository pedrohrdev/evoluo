"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Settings2, Trophy } from "lucide-react";
import Link from "next/link";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { GoalRecordCard } from "@/components/goals/goal-record-card";
import { RankingList } from "@/components/ranking/ranking-list";
import { StreakFlame } from "@/components/streak/streak-flame";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Surface } from "@/components/ui/surface";
import { listGoals } from "@/lib/api/goals";
import { getRanking } from "@/lib/api/ranking";
import { getTodayState } from "@/lib/api/records";
import { getStreak } from "@/lib/api/streak";
import type { RecordEntry } from "@/lib/api/types";
import { useChallenge } from "@/lib/challenge/challenge-context";
import { useStreakFeedback } from "@/lib/challenge/use-streak-feedback";
import { daysBetween } from "@/lib/format/format";

export default function DashboardPage() {
  const { participation } = useChallenge();
  const participantId = participation?.participantId;
  const challengeId = participation?.challengeId;
  const queryClient = useQueryClient();

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

  const today = todayQuery.data!;
  const streak = streakQuery.data!;
  const completedToday = streak.today?.completedGoalsCount ?? 0;
  const dailyConfigured = daily.length >= 3;

  const dayNumber = Math.min(
    participation.durationDays,
    Math.max(1, daysBetween(participation.startDate, new Date().toISOString()) + 1),
  );

  const ownPosition = rankingQuery.data?.find((e) => e.participantId === participantId)?.position;

  function findRecord(list: RecordEntry[], goalId: string) {
    return list.find((r) => r.goalId === goalId);
  }

  function handleRecorded(period: "daily" | "weekly" | "monthly" | "challenge", record: RecordEntry) {
    queryClient.setQueryData<typeof today>(["today", participantId], (current) => {
      if (!current) return current;
      const list = current[period];
      const withoutOld = list.filter((r) => r.goalId !== record.goalId);
      return { ...current, [period]: [...withoutOld, record] };
    });
    void queryClient.invalidateQueries({ queryKey: ["streak", participantId] });
    void queryClient.invalidateQueries({ queryKey: ["ranking", challengeId] });
  }

  return (
    <div className="flex flex-col gap-8">
      <Surface className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
        <HeroStat label="Streak atual" value={<StreakFlame value={streak.currentStreak} size="lg" />} hint={`recorde: ${streak.longestStreak}`} />
        <HeroStat label="Pontos" value={participation.totalPoints} hint="total no desafio" />
        <HeroStat label="Dia do desafio" value={`${dayNumber}/${participation.durationDays}`} />
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

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Hoje</h2>
            <p className="text-sm text-ink-muted">{completedToday}/3 metas diárias concluídas</p>
          </div>
          {!dailyConfigured ? (
            <Link
              href={`/c/${challengeId}/setup`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <Settings2 className="size-4" aria-hidden />
              Configurar metas diárias
            </Link>
          ) : null}
        </div>
        <ProgressBar value={(completedToday / 3) * 100} tone={completedToday === 3 ? "success" : "accent"} className="mb-4" />

        {!dailyConfigured ? (
          <Surface className="p-5 text-sm text-ink-muted">
            Configure as 3 metas diárias obrigatórias para começar a acompanhar seu streak.
          </Surface>
        ) : (
          <div className="flex flex-col gap-2">
            {daily.map((goal) => (
              <GoalRecordCard
                key={goal.id}
                goal={goal}
                record={findRecord(today.daily, goal.id)}
                onRecorded={(record) => handleRecorded("daily", record)}
              />
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
              {secondaryGoals.map((goal) => {
                const source = { weekly: today.weekly, monthly: today.monthly, challenge: today.challenge }[
                  goal.periodType as "weekly" | "monthly" | "challenge"
                ];
                return (
                  <GoalRecordCard
                    key={goal.id}
                    goal={goal}
                    record={findRecord(source, goal.id)}
                    onRecorded={(record) => handleRecorded(goal.periodType as "weekly" | "monthly" | "challenge", record)}
                  />
                );
              })}
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
    </div>
  );
}
