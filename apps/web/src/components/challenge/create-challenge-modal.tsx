"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { createChallenge } from "@/lib/api/challenges";
import { todayIsoDate } from "@/lib/format/today";
import { DurationPicker } from "./duration-picker";

export function CreateChallengeModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (challengeId: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState<30 | 50 | 100 | 365>(30);
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const challenge = await createChallenge({
        name,
        description: description || undefined,
        durationDays,
        startDate,
      });
      onOpenChange(false);
      onCreated(challenge.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o desafio.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Criar desafio" description="Convide amigos com o código gerado depois de criar.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="challenge-name">
          <Input id="challenge-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descrição (opcional)" htmlFor="challenge-description">
          <Input id="challenge-description" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Duração" htmlFor="challenge-duration">
          <DurationPicker value={durationDays} onChange={setDurationDays} />
        </Field>
        <Field label="Data de início" htmlFor="challenge-start">
          <Input id="challenge-start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={loading} className="mt-1">
          Criar desafio
        </Button>
      </form>
    </Modal>
  );
}
