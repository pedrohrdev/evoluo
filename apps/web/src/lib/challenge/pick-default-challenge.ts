import type { ProfileChallengeParticipation } from "@/lib/api/types";

// Qual desafio mostrar de cara quando alguém está em mais de um: o mais
// recentemente ativo (último check-in diário). Quem nunca fez check-in em
// nenhum entra pelo mais recém-entrado — a lista já vem ordenada por
// joinedAt desc (ProfilesService.getPublicProfile), então challenges[0] já
// é esse. Usado tanto pro próprio usuário (onboarding -> painel direto)
// quanto pro perfil de outra pessoa (profiles/[id] -> metas direto).
export function pickDefaultChallenge(
  challenges: ProfileChallengeParticipation[],
): ProfileChallengeParticipation | undefined {
  if (challenges.length === 0) return undefined;

  const withCheckIn = challenges.filter((c): c is ProfileChallengeParticipation & { lastCheckInDate: string } =>
    Boolean(c.lastCheckInDate),
  );
  if (withCheckIn.length === 0) return challenges[0];

  return withCheckIn.reduce((latest, c) => (c.lastCheckInDate > latest.lastCheckInDate ? c : latest));
}
