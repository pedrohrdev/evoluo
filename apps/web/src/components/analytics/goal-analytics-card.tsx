import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Surface } from "@/components/ui/surface";
import type { GoalAnalytics } from "@/lib/api/types";
import { formatNumber, formatValueForKind } from "@/lib/format/format";

const PERIOD_LABEL: Record<string, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  challenge: "Duração",
};

const KIND_LABEL: Record<string, string> = { hours: "Horas", quantity: "Quantidade", boolean: "Sim/não" };

export function GoalAnalyticsCard({ analytics }: { analytics: GoalAnalytics }) {
  const title = analytics.currentVersion?.title ?? "Meta";
  const target = analytics.currentVersion?.targetValue ?? null;

  return (
    <Surface className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium text-ink">{title}</p>
        <Badge tone="neutral">{PERIOD_LABEL[analytics.periodType]}</Badge>
      </div>

      {analytics.recordsCount === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">Ainda sem registros para analisar.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {analytics.byKind.map((agg) => (
            <div key={agg.kind}>
              <div className="mb-1.5 flex items-center justify-between text-xs text-ink-muted">
                <span>{KIND_LABEL[agg.kind]}</span>
                <span>{agg.recordsCount} registro(s)</span>
              </div>

              {agg.kind === "boolean" ? (
                <>
                  <ProgressBar
                    value={agg.recordsCount > 0 ? ((agg.completedCount ?? 0) / agg.recordsCount) * 100 : 0}
                    tone="success"
                  />
                  <p className="mt-1.5 text-sm text-ink">
                    {agg.completedCount ?? 0}/{agg.recordsCount} concluídos ·{" "}
                    {formatNumber(((agg.completedCount ?? 0) / agg.recordsCount) * 100)}% de taxa de conclusão
                  </p>
                </>
              ) : (
                <>
                  {target ? (
                    <ProgressBar value={Math.min(100, ((agg.average ?? 0) / target) * 100)} tone="accent" />
                  ) : null}
                  <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
                    <div>
                      <dt className="text-[11px] uppercase text-ink-faint">Total</dt>
                      <dd className="font-display text-sm font-semibold text-ink">
                        {formatValueForKind(agg.kind, agg.sum ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-ink-faint">Média</dt>
                      <dd className="font-display text-sm font-semibold text-ink">
                        {formatValueForKind(agg.kind, agg.average ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-ink-faint">Mín.</dt>
                      <dd className="font-display text-sm font-semibold text-ink">
                        {formatValueForKind(agg.kind, agg.min ?? 0)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-ink-faint">Máx.</dt>
                      <dd className="font-display text-sm font-semibold text-ink">
                        {formatValueForKind(agg.kind, agg.max ?? 0)}
                      </dd>
                    </div>
                  </dl>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}
