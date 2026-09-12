"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { createGoal, updateGoalVersion, type GoalVersionInput } from "@/lib/api/goals";
import type { Goal, GoalKind, GoalPeriod, Importance } from "@/lib/api/types";
import { GOAL_KIND_LABEL, IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { Segmented } from "./segmented";

const KIND_OPTIONS = (Object.entries(GOAL_KIND_LABEL) as [GoalKind, string][]).map(([value, label]) => ({
  value,
  label,
}));

const IMPORTANCE_OPTIONS = (Object.entries(IMPORTANCE_LABEL) as [Importance, string][]).map(([value, label]) => ({
  value,
  label,
}));

// Fraseado próprio do título do modal (frase completa), diferente do rótulo
// curto usado em badges (GOAL_PERIOD_LABEL) — mantido local de propósito.
const PERIOD_LABEL: Record<GoalPeriod, string> = {
  daily: "Meta diária",
  weekly: "Meta semanal",
  monthly: "Meta mensal",
  challenge: "Meta final do desafio",
};

// Os valores existiam em points_config e em GET /points-config desde a etapa
// 7, e nenhuma tela jamais os mostrou: "importância" era escolhida às cegas.
// Fixos aqui porque a tabela é configuração estável (CLAUDE.md seção 2), não
// dado de runtime — se mudar, muda junto.
const IMPORTANCE_POINTS_HINT: Record<GoalPeriod, string> = {
  daily: "Alta 30 pts · Média 20 · Baixa 10 por dia cumprido. Não muda o streak.",
  weekly: "Alta 90 pts · Média 60 · Baixa 30 por semana cumprida. Não muda o streak.",
  monthly: "Alta 120 pts · Média 80 · Baixa 40 por mês cumprido. Não muda o streak.",
  challenge: "Alta 150 pts · Média 100 · Baixa 50 se cumprir. Não muda o streak.",
};

export function GoalFormModal({
  open,
  onOpenChange,
  participantId,
  periodType,
  existingGoal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId: string;
  periodType: GoalPeriod;
  existingGoal?: Goal;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existingGoal?.currentVersion?.title ?? "");
  const [kind, setKind] = useState<GoalKind>(existingGoal?.currentVersion?.kind ?? "boolean");
  const [importance, setImportance] = useState<Importance>(existingGoal?.currentVersion?.importance ?? "medium");
  const [targetValue, setTargetValue] = useState(existingGoal?.currentVersion?.targetValue?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const input: GoalVersionInput = {
      title,
      kind,
      importance,
      targetValue: kind === "boolean" ? undefined : Number(targetValue),
    };

    try {
      if (existingGoal) {
        await updateGoalVersion(existingGoal.id, input);
      } else {
        await createGoal(participantId, { ...input, periodType });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar a meta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={existingGoal ? "Editar meta" : PERIOD_LABEL[periodType]}
      description={existingGoal ? "A edição vale só a partir de agora — o histórico já registrado não muda." : undefined}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Título" htmlFor="goal-title">
          <Input id="goal-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Tipo" htmlFor="goal-kind">
          <Segmented label="Tipo da meta" options={KIND_OPTIONS} value={kind} onChange={setKind} />
        </Field>
        {kind !== "boolean" ? (
          <Field label={kind === "hours" ? "Alvo (horas)" : "Alvo (quantidade)"} htmlFor="goal-target">
            <Input
              id="goal-target"
              type="number"
              min={0}
              step="0.01"
              required
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </Field>
        ) : null}
        <Field label="Quanto vale" htmlFor="goal-importance" hint={IMPORTANCE_POINTS_HINT[periodType]}>
          <Segmented label="Importância" options={IMPORTANCE_OPTIONS} value={importance} onChange={setImportance} />
        </Field>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={loading} className="mt-1">
          Salvar meta
        </Button>
      </form>
    </Modal>
  );
}
