"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/client";
import { joinChallenge } from "@/lib/api/challenges";

export function JoinChallengeModal({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined: (challengeId: string) => void;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const participant = await joinChallenge(joinCode.trim().toUpperCase());
      onOpenChange(false);
      onJoined(participant.challengeId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar no desafio.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Entrar em um desafio" description="Peça o código de 8 caracteres para quem criou.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Código do desafio" htmlFor="join-code">
          <Input
            id="join-code"
            required
            minLength={8}
            maxLength={8}
            autoCapitalize="characters"
            className="font-display uppercase tracking-[0.3em]"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={loading} className="mt-1">
          Entrar
        </Button>
      </form>
    </Modal>
  );
}
