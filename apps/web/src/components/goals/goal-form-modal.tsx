"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { createGoal, updateGoalVersion, type GoalVersionInput } from "@/lib/api/goals";
import type { Goal, GoalKind, GoalPeriod, Importance } from "@/lib/api/types";
import { Segmented } from "./segmented";

const KIND_OPTIONS: { value: GoalKind; label: string }[] = [
  { value: "hours", label: "Horas" },
  { value: "quantity", label: "Quantidade" },
  { value: "boolean", label: "Sim/não" },
];

const IMPORTANCE_OPTIONS: { value: Importance; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
];

const PERIOD_LABEL: Record<GoalPeriod, string> = {
  daily: "Meta diária",
  weekly: "Meta semanal",
  monthly: "Meta mensal",
  challenge: "Meta de duração do desafio",
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
        <Field label="Importância" htmlFor="goal-importance" hint="Afeta os pontos, nunca o streak.">
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
