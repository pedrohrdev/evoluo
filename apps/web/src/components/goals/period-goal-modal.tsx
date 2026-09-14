"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { RECORD_FN } from "@/lib/api/record-router";
import type { Goal, GoalPeriod, RecordEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { GOAL_PERIOD_LABEL, IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { formatValueForKind } from "@/lib/format/format";
import { useSound } from "@/lib/sounds/sound-context";
import { useToast } from "@/lib/toast/toast-context";

const PERIOD_HINT: Record<GoalPeriod, string> = {
  daily: "Vale para hoje. Dá para registrar e corrigir quantas vezes quiser até virar o dia — streak e pontos reagem na hora.",
  weekly: "Vale para a semana atual (segunda a domingo). Dá para atualizar quantas vezes quiser até domingo.",
  monthly: "Vale para o mês atual. Dá para atualizar quantas vezes quiser até o último dia.",
  challenge: "Vale para todo o desafio. Dá para atualizar quantas vezes quiser até o último dia.",
};

// Registro de meta avulso por goalId — mesmo formulário para diária,
// semanal, mensal e de duração (regra revisada: o check-in único por dia
// foi revertido, então a diária deixou de ter um fluxo separado). Cada
// período é livremente atualizável até o fim da própria janela (hoje, ou a
// semana/mês/desafio em curso).
export function PeriodGoalModal({
  goal,
  record,
  onOpenChange,
  onRecorded,
}: {
  goal: Goal | null;
  record: RecordEntry | undefined;
  onOpenChange: (open: boolean) => void;
  onRecorded: (periodType: GoalPeriod, record: RecordEntry) => void;
}) {
  const open = goal !== null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={goal?.currentVersion?.title ?? "Registrar meta"}
      description={goal ? PERIOD_HINT[goal.periodType] : undefined}
    >
      {goal ? (
        <PeriodGoalForm key={goal.id} goal={goal} record={record} onOpenChange={onOpenChange} onRecorded={onRecorded} />
      ) : null}
    </Modal>
  );
}

function PeriodGoalForm({
  goal,
  record,
  onOpenChange,
  onRecorded,
}: {
  goal: Goal;
  record: RecordEntry | undefined;
  onOpenChange: (open: boolean) => void;
  onRecorded: (periodType: GoalPeriod, record: RecordEntry) => void;
}) {
  const { play } = useSound();
  const { notify } = useToast();
  const version = goal.currentVersion;
  const [value, setValue] = useState(record?.actualValue?.toString() ?? "");
  const [booleanValue, setBooleanValue] = useState<boolean | undefined>(record?.actualBoolean ?? undefined);
  const [pending, setPending] = useState(false);

  if (!version) return null;

  const isBoolean = version.kind === "boolean";
  const filled = isBoolean ? booleanValue !== undefined : value !== "";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!filled) return;

    setPending(true);
    try {
      const periodType = goal.periodType;
      const body = isBoolean ? { actualBoolean: booleanValue } : { actualValue: Number(value) };
      const saved = await RECORD_FN[periodType](goal.id, body);

      onRecorded(periodType, saved);
      if (saved.completed) play("goal-complete");
      notify("Meta atualizada.", "success");
      onOpenChange(false);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente de novo.", "danger");
      play("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{GOAL_PERIOD_LABEL[goal.periodType]}</Badge>
        <Badge tone="neutral">{IMPORTANCE_LABEL[version.importance]}</Badge>
        {!isBoolean ? (
          <span className="text-xs text-ink-muted">alvo: {formatValueForKind(version.kind, version.targetValue)}</span>
        ) : null}
      </div>

      {isBoolean ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setBooleanValue(true)}
            className={cn(
              "h-10 flex-1 rounded-sm text-sm font-semibold transition-colors disabled:opacity-40",
              booleanValue === true ? "bg-success text-black" : "bg-surface-3 text-ink-muted hover:bg-surface-2",
            )}
          >
            Sim
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setBooleanValue(false)}
            className={cn(
              "h-10 flex-1 rounded-sm text-sm font-semibold transition-colors disabled:opacity-40",
              booleanValue === false
                ? "border border-line-strong bg-surface-1 text-ink"
                : "bg-surface-3 text-ink-muted hover:bg-surface-2",
            )}
          >
            Não
          </button>
        </div>
      ) : (
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          autoFocus
          disabled={pending}
          placeholder={`alvo: ${formatValueForKind(version.kind, version.targetValue)}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 w-full rounded-sm border border-line bg-surface-2 px-3 text-sm text-ink focus:border-accent disabled:opacity-40"
          aria-label={`Valor realizado para ${version.title}`}
        />
      )}

      <Button type="submit" loading={pending} disabled={pending || !filled}>
        Salvar
      </Button>
    </form>
  );
}
