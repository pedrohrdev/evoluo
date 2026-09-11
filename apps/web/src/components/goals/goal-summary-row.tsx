import { Check, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import type { Goal, RecordEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { formatValueForKind } from "@/lib/format/format";

type GoalState = "not-started" | "completed" | "incomplete";

function stateOf(record: RecordEntry | undefined): GoalState {
  if (!record) return "not-started";
  return record.completed ? "completed" : "incomplete";
}

// Variante somente-leitura de GoalRecordCard, sem input/botão — usada para
// exibir a meta de OUTRO participante (perfil público, CLAUDE.md seção 2
// "Perfis"), onde não faz sentido permitir registrar nada.
export function GoalSummaryRow({ goal, record }: { goal: Goal; record: RecordEntry | undefined }) {
  const version = goal.currentVersion;
  if (!version) return null;

  const state = stateOf(record);

  return (
    <Surface
      className={cn(
        "flex items-center justify-between gap-4 p-4",
        state === "completed" && "border-success/40 bg-success-soft",
        state === "incomplete" && "border-accent/30 bg-accent-soft",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {state === "completed" ? (
            <Check className="size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleDot
              className={cn("size-4 shrink-0", state === "incomplete" ? "text-accent" : "text-ink-faint")}
              aria-hidden
            />
          )}
          <p className="truncate font-medium text-ink">{version.title}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-6 text-xs text-ink-muted">
          <Badge tone="neutral">{IMPORTANCE_LABEL[version.importance]}</Badge>
          {version.kind !== "boolean" ? (
            <span>
              alvo: {formatValueForKind(version.kind, version.targetValue)}
              {record ? ` · feito: ${formatValueForKind(version.kind, record.actualValue)}` : ""}
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right text-xs text-ink-muted">
        <p className="font-medium text-ink">
          {!record
            ? "Sem registro hoje"
            : version.kind === "boolean"
              ? record.actualBoolean
                ? "Feito"
                : "Não feito"
              : record.completed
                ? "Concluída"
                : "Em aberto"}
        </p>
        {record ? <p>{record.pointsAwarded > 0 ? `+${record.pointsAwarded} pts` : "0 pts"}</p> : null}
      </div>
    </Surface>
  );
}
