"use client";

import { Check, CircleDot } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { ApiError } from "@/lib/api/client";
import { RECORD_FN } from "@/lib/api/record-router";
import type { Goal, RecordEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { formatValueForKind } from "@/lib/format/format";
import { useSound } from "@/lib/sounds/sound-context";
import { useToast } from "@/lib/toast/toast-context";

type GoalState = "not-started" | "completed" | "incomplete";

function stateOf(record: RecordEntry | undefined): GoalState {
  if (!record) return "not-started";
  return record.completed ? "completed" : "incomplete";
}

export function GoalRecordCard({
  goal,
  record,
  onRecorded,
}: {
  goal: Goal;
  record: RecordEntry | undefined;
  onRecorded: (record: RecordEntry) => void;
}) {
  const version = goal.currentVersion;
  const { play } = useSound();
  const { notify } = useToast();
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState(record?.actualValue?.toString() ?? "");

  if (!version) return null;

  const state = stateOf(record);
  const recordFn = RECORD_FN[goal.periodType];

  async function submit(body: { actualValue?: number; actualBoolean?: boolean }) {
    setPending(true);
    try {
      const saved = await recordFn(goal.id, body);
      onRecorded(saved);
      if (saved.completed) {
        play("goal-complete");
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Não foi possível registrar. Tente de novo.", "danger");
      play("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface
      className={cn(
        "flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        state === "completed" && "border-success/40 bg-success-soft",
        // "incomplete" é só "registrado abaixo do alvo até agora" — o
        // registro de hoje ainda pode ser editado (upsert idempotente), não
        // é uma falha definitiva. Usa o acento (energia/em andamento), não
        // vermelho — vermelho fica só para erro de verdade e para o
        // "não concluído" definitivo do histórico (dia já fechado).
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
          {record ? <span>{record.pointsAwarded > 0 ? `+${record.pointsAwarded} pts` : "0 pts"}</span> : null}
        </div>
      </div>

      {version.kind === "boolean" ? (
        <button
          disabled={pending}
          onClick={() => void submit({ actualBoolean: !(record?.actualBoolean ?? false) })}
          aria-pressed={record?.actualBoolean ?? false}
          className={cn(
            "flex h-10 w-full shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-150 sm:h-9 sm:w-16",
            record?.actualBoolean
              ? "bg-success text-black"
              : "bg-surface-3 text-ink-muted hover:bg-surface-2",
            pending && "opacity-60",
          )}
        >
          {record?.actualBoolean ? "Feito" : "Marcar"}
        </button>
      ) : (
        <form
          className="flex shrink-0 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(draft);
            if (!Number.isNaN(value)) void submit({ actualValue: value });
          }}
        >
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            className="h-10 w-full min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2 text-right text-sm text-ink focus:border-accent sm:h-9 sm:w-20 sm:flex-none"
            aria-label={`Valor realizado para ${version.title}`}
          />
          <button
            type="submit"
            disabled={pending || draft === ""}
            className="flex h-10 shrink-0 items-center rounded-sm bg-accent px-3 text-sm font-medium text-accent-on transition-colors hover:bg-accent-strong disabled:opacity-40 sm:h-9 sm:px-2.5"
          >
            Salvar
          </button>
        </form>
      )}
    </Surface>
  );
}
