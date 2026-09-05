"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { getProfile } from "@/lib/api/profiles";
import type { ProfileChallengeParticipation } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

interface ChallengeContextValue {
  challengeId: string;
  participation: ProfileChallengeParticipation | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const ChallengeContext = createContext<ChallengeContextValue | null>(null);

export function ChallengeProvider({ challengeId, children }: { challengeId: string; children: React.ReactNode }) {
  const { session } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-profile", session?.userId],
    queryFn: () => getProfile(session!.userId),
    enabled: !!session,
  });

  const participation = data?.challenges.find((c) => c.challengeId === challengeId);

  return (
    <ChallengeContext.Provider value={{ challengeId, participation, isLoading, isError, refetch }}>
      {children}
    </ChallengeContext.Provider>
  );
}

export function useChallenge(): ChallengeContextValue {
  const ctx = useContext(ChallengeContext);
  if (!ctx) throw new Error("useChallenge precisa estar dentro de <ChallengeProvider>.");
  return ctx;
}
