"use client";

import { useQuery } from "@tanstack/react-query";
import { getDaySeries } from "@/lib/api/records";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/format/format";

// Intensidade por metas cumpridas no dia. 3/3 usa o acento (a mesma cor do
// streak em todo o app); 1-2 são degraus intermediários; 0 é uma célula
// apagada — visível, mas sem alarme. Dias fora do desafio ficam neutros.
const TONE_BY_COUNT = [
  "bg-surface-3",
  "bg-accent/25",
  "bg-accent/55",
  "bg-accent",
] as const;

function toKey(iso: string): string {
  return iso.slice(0, 10);
}

function eachDay(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${toKey(startIso)}T00:00:00Z`);
  const end = new Date(`${toKey(endIso)}T00:00:00Z`);
  // Teto defensivo: nenhum desafio passa de 365 dias (CLAUDE.md seção 1),
  // mas um end_date corrompido não pode travar a aba.
  while (cursor <= end && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Um quadradinho por dia do desafio.
 *
 * "Sensação de evolução" é o que dá nome ao produto, e não existia
 * visualmente: o histórico era uma lista de cartões e as análises, quatro
 * números. `day_results` sempre teve exatamente o dado de uma célula por dia
 * — faltava desenhá-lo. Um ano inteiro numa tela, e a falha de um dia salta
 * aos olhos.
 */
export function DayHeatmap({ participantId }: { participantId: string }) {
  const { data } = useQuery({
    queryKey: ["day-series", participantId],
    queryFn: () => getDaySeries(participantId),
  });

  if (!data) return null;

  const byDate = new Map(data.days.map((day) => [toKey(day.resultDate), day]));
  const days = eachDay(data.startDate, data.endDate);
  const completed = data.days.filter((day) => day.dayCompleted).length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">O desafio inteiro</h2>
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{completed}</span> de {days.length} dias com as 3 metas
        </p>
      </div>

      {/* Grade em colunas de 7 (uma semana por coluna), rolando na
          horizontal em telas estreitas em vez de espremer as células. */}
      <div className="overflow-x-auto pb-1">
        <div className="grid grid-flow-col grid-rows-7 gap-1">
          {days.map((date) => {
            const result = byDate.get(date);
            const count = result?.completedGoalsCount ?? 0;
            const label = result
              ? `${formatDateLong(date)} — ${count} de 3 metas`
              : `${formatDateLong(date)} — sem registro`;

            return (
              <div
                key={date}
                title={label}
                aria-label={label}
                className={cn(
                  "size-3 rounded-[2px]",
                  result ? TONE_BY_COUNT[Math.min(count, 3)] : "bg-surface-2",
                )}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint">
        <span>menos</span>
        {TONE_BY_COUNT.map((tone, index) => (
          <span key={index} className={cn("size-3 rounded-[2px]", tone)} aria-hidden />
        ))}
        <span>3 de 3</span>
      </div>
    </section>
  );
}
