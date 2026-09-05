"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, History as HistoryIcon, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { listGoals } from "@/lib/api/goals";
import { getDailyHistory } from "@/lib/api/records";
import { useChallenge } from "@/lib/challenge/challenge-context";
import { formatDateLong, formatValueForKind } from "@/lib/format/format";

export default function HistoryPage() {
  const { participation } = useChallenge();
  const participantId = participation?.participantId;

  const historyQuery = useQuery({
    queryKey: ["daily-history", participantId],
    queryFn: () => getDailyHistory(participantId!),
    enabled: !!participantId,
  });
  const goalsQuery = useQuery({
    queryKey: ["goals", participantId],
    queryFn: () => listGoals(participantId!),
    enabled: !!participantId,
  });

  if (historyQuery.isLoading || goalsQuery.isLoading) return <LoadingState label="Carregando histórico…" />;
  if (historyQuery.isError) {
    return <ErrorState message="Não foi possível carregar o histórico." onRetry={() => void historyQuery.refetch()} />;
  }

  const titleByGoal = new Map((goalsQuery.data ?? []).map((g) => [g.id, g.currentVersion?.title ?? "Meta"]));
  const days = historyQuery.data ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        icon={HistoryIcon}
        title="Histórico diário"
        description="Dias já fechados — imutáveis, exatamente como registrados."
      />

      {days.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="Ainda sem dias fechados" description="O primeiro dia aparece aqui assim que o fechamento diário rodar." />
      ) : (
        <ol className="flex flex-col gap-3">
          {days.map((day) => (
            <li key={day.date}>
              <Surface className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{formatDateLong(day.date)}</p>
                  <Badge tone={day.dayCompleted ? "success" : "neutral"} className="shrink-0">
                    {day.completedGoalsCount}/3 {day.dayCompleted ? "· dia concluído" : ""}
                  </Badge>
                </div>
                {day.records.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {day.records.map((record) => (
                      <li key={record.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2 text-ink-muted">
                          {record.completed ? (
                            <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                          ) : (
                            <X className="size-3.5 shrink-0 text-danger" aria-hidden />
                          )}
                          <span className="truncate">{titleByGoal.get(record.goalId) ?? "Meta"}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-ink-faint">
                          {record.kind === "boolean"
                            ? record.actualBoolean
                              ? "sim"
                              : "não"
                            : formatValueForKind(record.kind, record.actualValue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-ink-faint">Nenhum registro lançado neste dia.</p>
                )}
              </Surface>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
