"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { createSpecialGoal } from "@/lib/api/special-goals";

export function CreateSpecialGoalModal({
  open,
  onOpenChange,
  challengeId,
  candidates,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  challengeId: string;
  candidates: { participantId: string; displayName: string }[];
  onCreated: () => void;
}) {
  const [toParticipantId, setToParticipantId] = useState(candidates[0]?.participantId ?? "");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createSpecialGoal(challengeId, { toParticipantId, title });
      setTitle("");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a meta especial.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Nova meta especial"
      description="Aplicada na hora, sem aceite. Cumpre a qualquer momento — não conta pra pontos, streak nem ranking."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Para quem" htmlFor="special-goal-target">
          <Select
            id="special-goal-target"
            required
            value={toParticipantId}
            onChange={(e) => setToParticipantId(e.target.value)}
          >
            {candidates.map((candidate) => (
              <option key={candidate.participantId} value={candidate.participantId}>
                {candidate.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="O que a pessoa precisa cumprir" htmlFor="special-goal-title">
          <Input
            id="special-goal-title"
            required
            maxLength={120}
            placeholder="Ex.: correr 5km até domingo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={loading} disabled={!toParticipantId} className="mt-1">
          Atribuir meta especial
        </Button>
      </form>
    </Modal>
  );
}
