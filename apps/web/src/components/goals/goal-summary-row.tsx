import { Check, CircleDot, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import type { Goal, RecordEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { formatValueForKind } from "@/lib/format/format";
import { GoalHistoryBadge } from "./goal-history-badge";

type GoalState = "not-started" | "completed" | "incomplete";

function stateOf(record: RecordEntry | undefined): GoalState {
  if (!record) return "not-started";
  return record.completed ? "completed" : "incomplete";
}

// Linha de meta em modo resumo. Sem `onRecord` é somente-leitura — usada
// para exibir a meta de OUTRO participante (perfil público, CLAUDE.md seção
// 2 "Perfis"). Com `onRecord`, ganha um botão de registrar: é assim que
// qualquer meta (diária, semanal, mensal ou de duração) é lançada — mesmo
// modal avulso por goalId para as quatro periodicidades (ver
// period-goal-modal.tsx).
export function GoalSummaryRow({
  goal,
  record,
  onRecord,
}: {
  goal: Goal;
  record: RecordEntry | undefined;
  onRecord?: () => void;
}) {
  const version = goal.currentVersion;
  if (!version) return null;

  const state = stateOf(record);

  // A primeira versão nasce na mesma transação da meta (GoalsService.create),
  // então uma vigência que começou bem depois da criação só pode ter vindo
  // de uma edição. A folga de 5s absorve a diferença entre os dois inserts.
  const wasEdited = new Date(version.validFrom).getTime() - new Date(goal.createdAt).getTime() > 5_000;

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
          {wasEdited ? <GoalHistoryBadge goalId={goal.id} createdAt={version.validFrom} /> : null}
          {version.kind !== "boolean" ? (
            <span>
              alvo: {formatValueForKind(version.kind, version.targetValue)}
              {record ? ` · feito: ${formatValueForKind(version.kind, record.actualValue)}` : ""}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right text-xs text-ink-muted">
          <p className="font-medium text-ink">
            {!record
              ? onRecord
                ? "Sem registro"
                : "Sem registro hoje"
              : version.kind === "boolean"
                ? record.actualBoolean
                  ? "Feito"
                  : "Não feito"
                : record.completed
                  ? "Concluída"
                  : "Abaixo do alvo"}
          </p>
          {record ? <p>{record.pointsAwarded > 0 ? `+${record.pointsAwarded} pts` : "0 pts"}</p> : null}
        </div>
        {onRecord ? (
          <button
            onClick={onRecord}
            className="rounded-sm p-2 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
            aria-label={`Registrar ${version.title}`}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </Surface>
  );
}
