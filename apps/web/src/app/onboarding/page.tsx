"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { CreateChallengeModal } from "@/components/challenge/create-challenge-modal";
import { JoinChallengeModal } from "@/components/challenge/join-challenge-modal";
import { StreakFlame } from "@/components/streak/streak-flame";
import { getProfile } from "@/lib/api/profiles";
import { useAuth } from "@/lib/auth/auth-context";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { daysBetween } from "@/lib/format/format";
import { useSound } from "@/lib/sounds/sound-context";

export default function OnboardingPage() {
  const { isReady } = useRequireAuth();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-profile", session?.userId],
    queryFn: () => getProfile(session!.userId),
    enabled: isReady && !!session,
  });

  function handleEnteredChallenge(challengeId: string) {
    play("joined");
    void queryClient.invalidateQueries({ queryKey: ["my-profile", session?.userId] });
    router.push(`/c/${challengeId}`);
  }

  if (!isReady) return null;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-8 flex items-center justify-between">
        <p className="font-display text-xl font-bold tracking-tight text-ink">
          evol<span className="text-accent">u</span>o
        </p>
        <button
          onClick={() => void signOut().then(() => router.replace("/login"))}
          className="text-sm text-ink-muted hover:text-ink"
        >
          Sair
        </button>
      </header>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Seus desafios</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setJoinOpen(true)}>
            <Users className="size-4" aria-hidden />
            Entrar com código
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Criar desafio
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingState label="Carregando seus desafios…" /> : null}
      {isError ? <ErrorState message="Não foi possível carregar seus desafios." onRetry={() => void refetch()} /> : null}

      {!isLoading && !isError && profile?.challenges.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Você ainda não está em nenhum desafio"
          description="Crie um novo desafio ou entre com o código de um amigo para começar."
        />
      ) : null}

      {!isLoading && profile && profile.challenges.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {profile.challenges.map((participation) => {
            const dayNumber = Math.max(1, daysBetween(participation.startDate, new Date().toISOString()) + 1);
            return (
              <li key={participation.participantId}>
                <Surface
                  as="button"
                  onClick={() => router.push(`/c/${participation.challengeId}`)}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:border-line-strong"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display font-semibold text-ink">{participation.challengeName}</p>
                      {participation.status === "inactive" ? <Badge tone="neutral">Encerrado para você</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      Dia {dayNumber} de {participation.durationDays} · {participation.totalPoints} pts
                    </p>
                  </div>
                  <StreakFlame value={participation.currentStreak} />
                </Surface>
              </li>
            );
          })}
        </ul>
      ) : null}

      <CreateChallengeModal open={createOpen} onOpenChange={setCreateOpen} onCreated={handleEnteredChallenge} />
      <JoinChallengeModal open={joinOpen} onOpenChange={setJoinOpen} onJoined={handleEnteredChallenge} />
    </div>
  );
}
