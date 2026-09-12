"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Surface } from "@/components/ui/surface";
import { ApiError } from "@/lib/api/client";
import { checkInDaily } from "@/lib/api/records";
import type { Goal, RecordEntry, TodayState } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { formatValueForKind, pluralize } from "@/lib/format/format";
import { useSound } from "@/lib/sounds/sound-context";
import { useToast } from "@/lib/toast/toast-context";

type Draft = { kind: "boolean"; value: boolean | undefined } | { kind: "number"; value: string };

function draftFor(goal: Goal, record: RecordEntry | undefined): Draft {
  if (goal.currentVersion?.kind === "boolean") {
    return { kind: "boolean", value: record?.actualBoolean ?? undefined };
  }
  return { kind: "number", value: record?.actualValue?.toString() ?? "" };
}

function isFilled(draft: Draft | undefined): boolean {
  if (!draft) return false;
  return draft.kind === "boolean" ? draft.value !== undefined : draft.value !== "";
}

// Prevê, no cliente, se o valor digitado cumpriria a meta — a mesma regra
// que o trigger compute_daily_record_fields aplica no banco
// (actual_value >= target_value, sem proporcionalidade). Serve só para
// avisar o participante ANTES de enviar; quem decide de verdade continua
// sendo o banco.
function wouldComplete(goal: Goal, draft: Draft | undefined): boolean {
  const version = goal.currentVersion;
  if (!version || !isFilled(draft) || !draft) return false;
  if (draft.kind === "boolean") return draft.value === true;
  const target = version.targetValue;
  if (target === null) return false;
  return Number(draft.value) >= target;
}

function CheckInForm({
  participantId,
  goals,
  recordsByGoalId,
  currentStreak,
  onDailyCheckedIn,
  onOpenChange,
}: {
  participantId: string;
  goals: Goal[];
  recordsByGoalId: Map<string, RecordEntry>;
  currentStreak: number;
  onDailyCheckedIn: (today: TodayState) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { play } = useSound();
  const { notify } = useToast();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(goals.map((g) => [g.id, draftFor(g, recordsByGoalId.get(g.id))])),
  );
  const [pending, setPending] = useState(false);
  // Segundo passo, só quando o envio vai de fato fechar o dia abaixo de 3/3.
  const [confirming, setConfirming] = useState(false);

  const completedCount = goals.filter((goal) => wouldComplete(goal, drafts[goal.id])).length;
  const dayWouldComplete = completedCount >= 3;
  const breaksStreak = !dayWouldComplete && currentStreak > 0;

  async function submit() {
    setPending(true);
    try {
      // Metas deixadas em branco simplesmente não são enviadas — continuam
      // sem registro (0/3 automático nas diárias, regra de negócio
      // existente), não é erro nem bloqueia o envio das demais.
      const payload = goals
        .filter((goal) => isFilled(drafts[goal.id]))
        .map((goal) => {
          const draft = drafts[goal.id];
          return {
            goalId: goal.id,
            ...(draft.kind === "boolean" ? { actualBoolean: draft.value } : { actualValue: Number(draft.value) }),
          };
        });

      const today = await checkInDaily(participantId, payload);

      onDailyCheckedIn(today);
      if (today.daily.some((record) => record.completed)) play("goal-complete");
      onOpenChange(false);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Não foi possível concluir o check-in. Tente de novo.", "danger");
      play("error");
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Fechar o dia abaixo de 3/3 zera o streak na hora e não tem volta —
    // ver CLAUDE.md seção "Streak". Nada na tela comunicava isso antes:
    // o botão era o mesmo com 3/3 e com 1/3.
    if (!dayWouldComplete && !confirming) {
      setConfirming(true);
      return;
    }
    void submit();
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-4">
        <Surface className="flex gap-3 border-danger/40 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-ink">
              Você vai fechar hoje com {completedCount} de 3 metas cumpridas.
            </p>
            <p className="mt-1 text-ink-muted">
              {breaksStreak
                ? `Isso zera seu streak de ${pluralize(currentStreak, "dia", "dias")} e não tem como desfazer. Você só faz check-in uma vez por dia.`
                : "O dia só conta para o streak com as 3 metas cumpridas. Você só faz check-in uma vez por dia, então não dá para completar depois."}
            </p>
          </div>
        </Surface>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
            Voltar e preencher
          </Button>
          <Button variant="danger" loading={pending} onClick={() => void submit()}>
            {breaksStreak ? "Enviar e perder o streak" : "Enviar assim mesmo"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        <span className={cn("font-medium", dayWouldComplete ? "text-success" : "text-ink")}>
          {completedCount} de 3
        </span>{" "}
        metas cumpridas com o que você preencheu.
        {dayWouldComplete ? " O dia conta para o streak." : " São necessárias as 3 para o dia contar."}
      </p>

      {goals.map((goal) => {
        const version = goal.currentVersion;
        if (!version) return null;
        const draft = drafts[goal.id];
        const filled = isFilled(draft);
        const complete = wouldComplete(goal, draft);

        return (
          <Surface
            key={goal.id}
            className={cn("flex flex-col gap-2 p-3", filled && (complete ? "border-success/40" : "border-danger/40"))}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{version.title}</p>
              <Badge tone="neutral">{IMPORTANCE_LABEL[version.importance]}</Badge>
              {filled ? (
                <Badge tone={complete ? "success" : "danger"}>{complete ? "cumprida" : "abaixo do alvo"}</Badge>
              ) : null}
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
          </Surface>
        );
      })}

      <Button
        type="submit"
        variant={dayWouldComplete ? "primary" : "secondary"}
        loading={pending}
        disabled={pending}
        className="mt-1"
      >
        {dayWouldComplete ? "Enviar e fechar o dia" : `Enviar com ${completedCount} de 3`}
      </Button>
    </form>
  );
}

// Check-in diário, e SÓ ele. Metas semanais/mensais/de duração têm o próprio
// registro (PeriodGoalModal), porque são operações com consequências
// diferentes: registrar a meta da semana não deveria — e antes disso
// acontecia — fechar o dia e zerar o streak de quem só queria lançar as
// horas da semana de manhã.
//
// Só é possível 1 check-in por dia (CLAUDE.md seção "Streak"): depois de
// enviado, o painel esconde este botão até amanhã.
export function CheckInModal({
  open,
  onOpenChange,
  participantId,
  goals,
  recordsByGoalId,
  currentStreak,
  onDailyCheckedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId: string;
  goals: Goal[];
  recordsByGoalId: Map<string, RecordEntry>;
  currentStreak: number;
  onDailyCheckedIn: (today: TodayState) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Check-in de hoje"
      description="Você só faz check-in uma vez por dia. O que enviar agora fecha o dia — e decide se seu streak continua."
      className="max-w-lg"
    >
      {open ? (
        <CheckInForm
          participantId={participantId}
          goals={goals}
          recordsByGoalId={recordsByGoalId}
          currentStreak={currentStreak}
          onDailyCheckedIn={onDailyCheckedIn}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Modal>
  );
}
