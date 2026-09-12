"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, History as HistoryIcon, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { getDailyHistory } from "@/lib/api/records";
import { DayHeatmap } from "./day-heatmap";
import { formatDateLong, formatValueForKind } from "@/lib/format/format";

// Extraído de app/c/[challengeId]/history/page.tsx para ser reaproveitado
// também na visão somente-leitura do histórico de outro participante
// (app/profiles/[id]/challenges/[challengeId]/history) — parametrizado
// por participantId em vez de depender de useChallenge() (que só resolve
// a participação do usuário logado).
export function DailyHistoryView({ participantId }: { participantId: string }) {
  const historyQuery = useQuery({
    queryKey: ["daily-history", participantId],
    queryFn: () => getDailyHistory(participantId),
  });
  if (historyQuery.isLoading) return <LoadingState label="Carregando histórico…" />;
  if (historyQuery.isError) {
    return <ErrorState message="Não foi possível carregar o histórico." onRetry={() => void historyQuery.refetch()} />;
  }

  const days = historyQuery.data ?? [];

  if (days.length === 0) {
    return (
      <EmptyState
        icon={HistoryIcon}
        title="Ainda sem dias fechados"
        description="Seu primeiro dia aparece aqui depois da meia-noite."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <DayHeatmap participantId={participantId} />

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
                      <span className="truncate">{record.title}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-faint">
                      {record.kind === "boolean"
                        ? record.actualBoolean
                          ? "sim"
                          : "não"
                        : `${formatValueForKind(record.kind, record.actualValue)} de ${formatValueForKind(
                            record.kind,
                            record.targetValueSnapshot,
                          )}`}
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
    </div>
  );
}
