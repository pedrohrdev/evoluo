"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { getProfile, profileQueryKey } from "@/lib/api/profiles";
import type { ProfileChallengeParticipation, PublicProfile } from "@/lib/api/types";

interface ProfileParticipationValue {
  profile: PublicProfile | undefined;
  participation: ProfileChallengeParticipation | undefined;
  isLoading: boolean;
  isError: boolean;
}

const ProfileParticipationContext = createContext<ProfileParticipationValue | null>(null);

// Equivalente a ChallengeProvider (challenge-context.tsx), mas para ver a
// participação de OUTRO usuário num desafio a partir do perfil público
// dele — nunca resolve pelo usuário logado. Reaproveita GET /profiles/:id
// (já público, CLAUDE.md seção 2 "Perfis"), que retorna as metas e os
// agregados de cada participação.
export function ProfileParticipationProvider({
  profileId,
  challengeId,
  children,
}: {
  profileId: string;
  challengeId: string;
  children: React.ReactNode;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: profileQueryKey(profileId),
    queryFn: () => getProfile(profileId),
  });

  const participation = data?.challenges.find((c) => c.challengeId === challengeId);

  return (
    <ProfileParticipationContext.Provider value={{ profile: data, participation, isLoading, isError }}>
      {children}
    </ProfileParticipationContext.Provider>
  );
}

export function useProfileParticipation(): ProfileParticipationValue {
  const ctx = useContext(ProfileParticipationContext);
  if (!ctx) throw new Error("useProfileParticipation precisa estar dentro de <ProfileParticipationProvider>.");
  return ctx;
}
