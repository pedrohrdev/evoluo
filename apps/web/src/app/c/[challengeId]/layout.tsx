"use client";

import { use } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { JoinCodeBadge } from "@/components/challenge/join-code-badge";
import { EmptyState } from "@/components/ui/feedback";
import { LoadingState } from "@/components/ui/feedback";
import { ChallengeProvider, useChallenge } from "@/lib/challenge/challenge-context";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { Ban } from "lucide-react";
import Link from "next/link";

function ChallengeGate({ children }: { children: React.ReactNode }) {
  const { participation, isLoading, isError } = useChallenge();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Carregando desafio…" />
      </div>
    );
  }

  if (isError || !participation) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <EmptyState
          icon={Ban}
          title="Você não participa deste desafio"
          description="Confira o link ou entre com o código do desafio."
          action={
            <Link href="/onboarding" className="text-sm font-medium text-accent hover:underline">
              Ir para meus desafios
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <AppShell
      challengeId={participation.challengeId}
      challengeName={participation.challengeName}
      headerExtra={<JoinCodeBadge challengeId={participation.challengeId} />}
    >
      {children}
    </AppShell>
  );
}

export default function ChallengeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ challengeId: string }>;
}) {
  const { challengeId } = use(params);
  const { isReady } = useRequireAuth();

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  return (
    <ChallengeProvider challengeId={challengeId}>
      <ChallengeGate>{children}</ChallengeGate>
    </ChallengeProvider>
  );
}
