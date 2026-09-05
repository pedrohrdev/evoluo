"use client";

import { Check, CircleDot } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import { ApiError } from "@/lib/api/client";
import { RECORD_FN } from "@/lib/api/record-router";
import type { Goal, RecordEntry } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatValueForKind } from "@/lib/format/format";
import { useSound } from "@/lib/sounds/sound-context";
import { useToast } from "@/lib/toast/toast-context";

const IMPORTANCE_LABEL: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta" };

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
        "flex items-center justify-between gap-4 p-4 transition-colors",
        state === "completed" && "border-success/40 bg-success-soft",
        state === "incomplete" && "border-danger/30 bg-danger-soft",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {state === "completed" ? (
            <Check className="size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleDot className="size-4 shrink-0 text-ink-faint" aria-hidden />
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
            "flex h-9 w-16 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-150",
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
            className="h-9 w-20 rounded-sm border border-line bg-surface-2 px-2 text-right text-sm text-ink focus:border-accent"
            aria-label={`Valor realizado para ${version.title}`}
          />
          <button
            type="submit"
            disabled={pending || draft === ""}
            className="flex h-9 items-center rounded-sm bg-accent px-2.5 text-sm font-medium text-accent-on transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            Salvar
          </button>
        </form>
      )}
    </Surface>
  );
}
