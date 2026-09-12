import { apiFetch } from "./client";
import type { Challenge, ChallengeJoinCode, ChallengePreview } from "./types";

export function createChallenge(input: {
  name: string;
  description?: string;
  durationDays: 30 | 50 | 100 | 365;
  startDate: string;
}) {
  return apiFetch<Challenge>("/challenges", { method: "POST", body: input });
}

export function joinChallenge(joinCode: string) {
  return apiFetch<{ id: string; challengeId: string; userId: string }>("/challenges/join", {
    method: "POST",
    body: { joinCode },
  });
}

export function getChallenge(id: string) {
  return apiFetch<Challenge>(`/challenges/${id}`);
}

// Separado de getChallenge porque o código de convite não é público — só
// quem já participa do desafio consegue lê-lo (ChallengesService.findJoinCode).
export function getJoinCode(challengeId: string) {
  return apiFetch<ChallengeJoinCode>(`/challenges/${challengeId}/join-code`);
}

// Sair do desafio: marca o vínculo como inativo, preserva histórico, pontos
// e streaks (CLAUDE.md seção 2). Não confunda com deleteChallenge.
export function leaveChallenge(id: string) {
  return apiFetch<{ id: string; status: "inactive" }>(`/challenges/${id}/leave`, { method: "POST" });
}

// Hard-delete total (só o criador) — apaga o desafio e cascateia para
// todos os participantes, sem volta. Ver ChallengesService.remove (API).
export function deleteChallenge(id: string) {
  return apiFetch<void>(`/challenges/${id}`, { method: "DELETE" });
}

// Prévia pública de um convite — única chamada do app que não exige sessão
// (auth: false). É o que permite a página /join/[code] abrir para quem
// ainda não tem conta.
export function previewChallenge(joinCode: string) {
  return apiFetch<ChallengePreview>(`/challenges/preview/${encodeURIComponent(joinCode)}`, { auth: false });
}
