"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame, Medal, Repeat, Trophy } from "lucide-react";
import Link from "next/link";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { Avatar } from "@/components/profile/avatar";
import { StreakFlame } from "@/components/streak/streak-flame";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { getParticipantAnalytics } from "@/lib/api/analytics";
import { getRanking } from "@/lib/api/ranking";
import type { ProfileChallengeParticipation } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { GOAL_KIND_LABEL } from "@/lib/domain/labels";
import { formatDateLong, formatValueForKind, pluralize } from "@/lib/format/format";

const MEDAL_TONE: Record<number, string> = {
  1: "text-[#e0b23a]",
  2: "text-ink-faint",
  3: "text-[#c2793c]",
};

// Tela de encerramento do desafio.
//
// Até aqui o produto tinha começo e meio e não tinha fim: passado o
// end_date, o painel simplesmente travava o contador em "30/30" e seguia
// mostrando um botão de check-in. Sem encerramento não há vencedor, não há
// resultado e não há motivo para um segundo desafio.
//
// Nada aqui é calculado do zero: pódio vem do ranking, os totais reais vêm
// do analytics (que sempre usou os valores registrados, mesmo quando a meta
// não foi cumprida — CLAUDE.md seção "Analytics").
export function ChallengeResult({
  participation,
  challengeId,
}: {
  participation: ProfileChallengeParticipation;
  challengeId: string;
}) {
  const rankingQuery = useQuery({
    queryKey: ["ranking", challengeId],
    queryFn: () => getRanking(challengeId),
  });

  const analyticsQuery = useQuery({
    queryKey: ["analytics", participation.participantId],
    queryFn: () => getParticipantAnalytics(participation.participantId),
  });

  const ranking = rankingQuery.data ?? [];
  const own = ranking.find((entry) => entry.participantId === participation.participantId);
  const winner = ranking[0];
  const ownWon = winner?.participantId === participation.participantId;

  // Totais reais acumulados por meta — é a frase que faz a pessoa sentir o
  // tamanho do que fez ("você leu 340 páginas em 30 dias").
  const totals = (analyticsQuery.data ?? [])
    .flatMap((goal) =>
      goal.byKind
        .filter((agg) => agg.kind !== "boolean" && (agg.sum ?? 0) > 0)
        .map((agg) => ({
          title: goal.currentVersion?.title ?? GOAL_KIND_LABEL[agg.kind],
          kind: agg.kind,
          sum: agg.sum ?? 0,
        })),
    )
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-8">
      <Surface className="flex flex-col items-center gap-2 p-8 text-center">
        <Trophy className={cn("size-8", ownWon ? "text-accent" : "text-ink-faint")} aria-hidden />
        <h1 className="font-display text-2xl font-semibold text-ink">
          {ownWon ? "Você venceu o desafio" : "Desafio encerrado"}
        </h1>
        <p className="max-w-md text-sm text-ink-muted">
          {participation.challengeName} terminou em {formatDateLong(participation.endDate)}.
          {ownWon
            ? " Maior streak, mais consistência — o placar é seu."
            : winner
              ? ` ${winner.displayName ?? "Outro participante"} terminou em primeiro.`
              : ""}
        </p>
      </Surface>

      <Surface className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
        <HeroStat
          label="Posição final"
          value={own ? `${own.position}º` : "—"}
          hint={`de ${pluralize(ranking.length, "participante", "participantes")}`}
        />
        <HeroStat label="Maior streak" value={<StreakFlame value={participation.longestStreak} size="lg" />} />
        <HeroStat label="Pontos" value={participation.totalPoints} hint="no desafio" />
        <HeroStat
          label="Dias completos"
          value={`${participation.totalDaysCompleted}/${participation.durationDays}`}
          hint="com as 3 metas"
        />
      </Surface>

      {totals.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">O que você acumulou</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {totals.map((total) => (
              <Surface key={total.title} className="flex items-baseline justify-between gap-3 p-4">
                <span className="min-w-0 truncate text-sm text-ink-muted">{total.title}</span>
                <span className="shrink-0 font-display text-lg font-semibold tabular-nums text-ink">
                  {formatValueForKind(total.kind, total.sum)}
                </span>
              </Surface>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Classificação final</h2>
        {rankingQuery.isLoading ? (
          <LoadingState label="Carregando classificação…" />
        ) : (
          <Surface className="flex flex-col gap-0.5 p-2">
            {ranking.map((entry) => (
              <Link
                key={entry.participantId}
                href={`/profiles/${entry.userId}`}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2",
                  entry.participantId === participation.participantId && "bg-accent-soft",
                )}
              >
                {entry.position <= 3 ? (
                  <Medal className={cn("size-4 shrink-0", MEDAL_TONE[entry.position])} aria-hidden />
                ) : (
                  <span className="w-4 shrink-0 text-center text-sm tabular-nums text-ink-faint">{entry.position}</span>
                )}
                <Avatar
                  displayName={entry.displayName ?? "Participante"}
                  avatarUrl={entry.avatarUrl}
                  className="size-8"
                  textClassName="text-xs"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {entry.displayName ?? "Participante"}
                </span>
                <Flame className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink-muted">
                  {entry.currentStreak}
                </span>
                <span className="w-14 shrink-0 text-right text-sm tabular-nums text-ink-muted">
                  {entry.totalPoints}
                </span>
              </Link>
            ))}
          </Surface>
        )}
      </section>

      <Surface className="flex flex-col items-start gap-3 p-6">
        <Badge tone="neutral">Próximo passo</Badge>
        <p className="text-sm text-ink-muted">
          Um desafio novo começa do zero: streak, pontos e ranking zerados. Este aqui fica no seu perfil, inteiro.
        </p>
        <Link href="/onboarding?all=1" className={cn(buttonStyles({ size: "md" }))}>
          <Repeat className="size-4" aria-hidden />
          Criar a revanche
        </Link>
      </Surface>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href={`/c/${challengeId}/history`} className="text-accent hover:underline">
          Ver histórico completo
        </Link>
        <Link href={`/c/${challengeId}/analytics`} className="text-accent hover:underline">
          Ver análises
        </Link>
      </div>
    </div>
  );
}
