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
