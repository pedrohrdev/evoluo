"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Surface } from "@/components/ui/surface";
import { ApiError } from "@/lib/api/client";
import { RECORD_FN } from "@/lib/api/record-router";
import { checkInDaily } from "@/lib/api/records";
import type { Goal, GoalPeriod, RecordEntry, TodayState } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { GOAL_PERIOD_LABEL, IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { formatValueForKind } from "@/lib/format/format";
import { useSound } from "@/lib/sounds/sound-context";
import { useToast } from "@/lib/toast/toast-context";

type Draft = { kind: "boolean"; value: boolean | undefined } | { kind: "number"; value: string };

function draftFor(goal: Goal, record: RecordEntry | undefined): Draft {
  if (goal.currentVersion?.kind === "boolean") {
    return { kind: "boolean", value: record?.actualBoolean ?? undefined };
  }
  return { kind: "number", value: record?.actualValue?.toString() ?? "" };
}

// Corpo do formulário: só é montado enquanto o modal está aberto (ver
// CheckInModal abaixo), então o estado inicial de `drafts` já nasce
// preenchido com o que existir hoje — reabrir o check-in mais tarde no
// mesmo dia para corrigir um valor mostra o que já foi salvo, sem precisar
// de um efeito para "resetar" o formulário a cada abertura.
function CheckInForm({
  participantId,
  goals,
  recordsByGoalId,
  onRecorded,
  onDailyCheckedIn,
  onOpenChange,
}: {
  participantId: string;
  goals: Goal[];
  recordsByGoalId: Map<string, RecordEntry>;
  onRecorded: (periodType: GoalPeriod, record: RecordEntry) => void;
  onDailyCheckedIn: (today: TodayState) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { play } = useSound();
  const { notify } = useToast();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(goals.map((g) => [g.id, draftFor(g, recordsByGoalId.get(g.id))])),
  );
  const [pending, setPending] = useState(false);

  const hasAnyDraft = goals.some((g) => {
    const d = drafts[g.id];
    if (!d) return false;
    return d.kind === "boolean" ? d.value !== undefined : d.value !== "";
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      // Metas deixadas em branco simplesmente não são enviadas — continuam
      // sem registro (0/3 automático nas diárias, regra de negócio
      // existente), não é erro nem bloqueia o envio das demais.
      const toSubmit = goals.filter((g) => {
        const d = drafts[g.id];
        if (!d) return false;
        return d.kind === "boolean" ? d.value !== undefined : d.value !== "";
      });

      const dailyEntries = toSubmit.filter((g) => g.periodType === "daily");
      const periodEntries = toSubmit.filter((g) => g.periodType !== "daily") as (Goal & {
        periodType: Exclude<GoalPeriod, "daily">;
      })[];

      const dailyPayload = dailyEntries.map((goal) => {
        const draft = drafts[goal.id];
        return {
          goalId: goal.id,
          ...(draft.kind === "boolean" ? { actualBoolean: draft.value } : { actualValue: Number(draft.value) }),
        };
      });

      // O check-in diário é sempre enviado (mesmo vazio) — é ele quem
      // fecha o dia de hoje (streak/pontos), regra de negócio confirmada:
      // só é possível fazer 1 check-in por dia, então abrir esta tela e
      // concluir sempre conta como o check-in do dia, tenha ou não
      // preenchido alguma diária.
      const [today, periodResults] = await Promise.all([
        checkInDaily(participantId, dailyPayload),
        Promise.all(
          periodEntries.map(async (goal) => {
            const draft = drafts[goal.id];
            const body =
              draft.kind === "boolean" ? { actualBoolean: draft.value } : { actualValue: Number(draft.value) };
            const record = await RECORD_FN[goal.periodType](goal.id, body);
            return { periodType: goal.periodType, record };
          }),
        ),
      ]);

      onDailyCheckedIn(today);
      periodResults.forEach(({ periodType, record }) => onRecorded(periodType, record));

      const anyCompleted = today.daily.some((r) => r.completed) || periodResults.some(({ record }) => record.completed);
      if (anyCompleted) play("goal-complete");
      onOpenChange(false);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Não foi possível concluir o check-in. Tente de novo.", "danger");
      play("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {goals.map((goal) => {
        const version = goal.currentVersion;
        if (!version) return null;
        const draft = drafts[goal.id];
        const existing = recordsByGoalId.get(goal.id);

        return (
          <Surface key={goal.id} className="flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{version.title}</p>
              <Badge tone="neutral">{GOAL_PERIOD_LABEL[goal.periodType]}</Badge>
              <Badge tone="neutral">{IMPORTANCE_LABEL[version.importance]}</Badge>
            </div>

            {version.kind === "boolean" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setDrafts((d) => ({ ...d, [goal.id]: { kind: "boolean", value: true } }))}
                  className={cn(
                    "h-9 flex-1 rounded-sm text-sm font-semibold transition-colors disabled:opacity-40",
                    draft?.kind === "boolean" && draft.value === true
                      ? "bg-success text-black"
                      : "bg-surface-3 text-ink-muted hover:bg-surface-2",
                  )}
                >
                  Sim
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setDrafts((d) => ({ ...d, [goal.id]: { kind: "boolean", value: false } }))}
                  className={cn(
                    "h-9 flex-1 rounded-sm text-sm font-semibold transition-colors disabled:opacity-40",
                    draft?.kind === "boolean" && draft.value === false
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
                disabled={pending}
                placeholder={`alvo: ${formatValueForKind(version.kind, version.targetValue)}`}
                value={draft?.kind === "number" ? draft.value : ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [goal.id]: { kind: "number", value: e.target.value } }))}
                className="h-9 w-full rounded-sm border border-line bg-surface-2 px-2.5 text-sm text-ink focus:border-accent disabled:opacity-40"
                aria-label={`Valor realizado para ${version.title}`}
              />
            )}

            {existing ? (
              <p className="text-xs text-ink-faint">
                já registrado hoje:{" "}
                {version.kind === "boolean"
                  ? existing.actualBoolean
                    ? "sim"
                    : "não"
                  : formatValueForKind(version.kind, existing.actualValue)}
                {" · "}
                {existing.pointsAwarded > 0 ? `+${existing.pointsAwarded} pts` : "0 pts"}
              </p>
            ) : null}
          </Surface>
        );
      })}

      <Button type="submit" loading={pending} disabled={pending || !hasAnyDraft} className="mt-1">
        Concluir check-in
      </Button>
    </form>
  );
}

// Único ponto de registro de metas: em vez de cada meta ter seu próprio
// botão "Salvar" independente (permitindo registrar uma agora e outra
// horas depois), o participante abre "Fazer check-in", preenche o que
// quiser das metas diárias + opcionais ativas, e envia tudo de uma vez.
// Só é possível 1 check-in por dia (CLAUDE.md seção "Streak") — depois de
// enviado, o dashboard esconde este botão até o dia seguinte.
export function CheckInModal({
  open,
  onOpenChange,
  participantId,
  goals,
  recordsByGoalId,
  onRecorded,
  onDailyCheckedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId: string;
  goals: Goal[];
  recordsByGoalId: Map<string, RecordEntry>;
  onRecorded: (periodType: GoalPeriod, record: RecordEntry) => void;
  onDailyCheckedIn: (today: TodayState) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Fazer check-in"
      description="Isso conta como seu único check-in de hoje — depois de enviar, não dá pra editar até amanhã."
      className="max-w-lg"
    >
      {open ? (
        <CheckInForm
          participantId={participantId}
          goals={goals}
          recordsByGoalId={recordsByGoalId}
          onRecorded={onRecorded}
          onDailyCheckedIn={onDailyCheckedIn}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Modal>
  );
}
