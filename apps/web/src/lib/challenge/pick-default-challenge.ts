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
  // Desafios que a pessoa deixou nunca são o destino padrão: sem isto, quem
  // saiu do único desafio ficava preso sendo redirecionado de volta para um
  // painel em que não pode registrar nada.
  const active = challenges.filter((c) => c.status === "active");
  if (active.length === 0) return undefined;
  challenges = active;

  const withCheckIn = challenges.filter((c): c is ProfileChallengeParticipation & { lastCheckInDate: string } =>
    Boolean(c.lastCheckInDate),
  );
  if (withCheckIn.length === 0) return challenges[0];

  return withCheckIn.reduce((latest, c) => (c.lastCheckInDate > latest.lastCheckInDate ? c : latest));
}
