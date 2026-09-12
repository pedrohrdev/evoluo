import { apiFetch } from "./client";
import type { SpecialGoal } from "./types";

export function listSpecialGoals(challengeId: string) {
  return apiFetch<SpecialGoal[]>(`/challenges/${challengeId}/special-goals`);
}

export function createSpecialGoal(challengeId: string, input: { toParticipantId: string; title: string }) {
  return apiFetch<SpecialGoal>(`/challenges/${challengeId}/special-goals`, { method: "POST", body: input });
}

export function completeSpecialGoal(specialGoalId: string) {
  return apiFetch<SpecialGoal>(`/special-goals/${specialGoalId}/complete`, { method: "PATCH" });
}

export function cancelSpecialGoal(specialGoalId: string) {
  return apiFetch<SpecialGoal>(`/special-goals/${specialGoalId}/cancel`, { method: "PATCH" });
}

// Recusar: contrapartida de concluir, só para quem recebeu. Sem ela a meta
// especial era de mão única — nada pode ser apagado, então quem recebia não
// tinha saída nenhuma.
export function declineSpecialGoal(id: string) {
  return apiFetch<SpecialGoal>(`/special-goals/${id}/decline`, { method: "PATCH" });
}

// Contador para o badge da navegação, sem carregar a lista inteira.
export function getPendingSpecialGoalsCount(participantId: string) {
  return apiFetch<{ participantId: string; pending: number }>(
    `/challenge-participants/${participantId}/special-goals/pending-count`,
  );
}
