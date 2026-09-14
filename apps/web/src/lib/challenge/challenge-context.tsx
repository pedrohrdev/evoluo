"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { getOwnDashboard, profileQueryKey } from "@/lib/api/profiles";
import type { DefaultChallengeDashboard, ProfileChallengeParticipation } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

interface ChallengeContextValue {
  challengeId: string;
  participation: ProfileChallengeParticipation | undefined;
  // Só preenchido quando este É o desafio padrão (pickDefaultChallenge) —
  // o único que o backend calcula hoje/streak/ranking pra evitar computar
  // isso pra cada participação de quem está em vários desafios. Usado por
  // DashboardPage como initialData, pra pular a 2ª ida-e-volta sequencial
  // no caminho mais comum (entrar no site -> cair direto no painel).
  dashboardBundle: DefaultChallengeDashboard | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const ChallengeContext = createContext<ChallengeContextValue | null>(null);

export function ChallengeProvider({ challengeId, children }: { challengeId: string; children: React.ReactNode }) {
  const { session } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: profileQueryKey(session?.userId ?? ""),
    queryFn: () => getOwnDashboard(),
    enabled: !!session,
  });

  const participation = data?.challenges.find((c) => c.challengeId === challengeId);
  const dashboardBundle = data?.defaultChallenge?.challengeId === challengeId ? data.defaultChallenge : undefined;

  return (
    <ChallengeContext.Provider value={{ challengeId, participation, dashboardBundle, isLoading, isError, refetch }}>
      {children}
    </ChallengeContext.Provider>
  );
}

export function useChallenge(): ChallengeContextValue {
  const ctx = useContext(ChallengeContext);
  if (!ctx) throw new Error("useChallenge precisa estar dentro de <ChallengeProvider>.");
  return ctx;
}
