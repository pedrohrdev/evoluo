import { apiFetch } from "./client";
import type { Goal, GoalKind, GoalPeriod, GoalVersion, Importance } from "./types";

export interface GoalVersionInput {
  kind: GoalKind;
  importance: Importance;
  title: string;
  targetValue?: number;
}

export function listGoals(participantId: string) {
  return apiFetch<Goal[]>(`/challenge-participants/${participantId}/goals`);
}

export function createGoal(participantId: string, input: GoalVersionInput & { periodType: GoalPeriod }) {
  return apiFetch<Goal & { currentVersion: GoalVersion }>(`/challenge-participants/${participantId}/goals`, {
    method: "POST",
    body: input,
  });
}

export function updateGoalVersion(goalId: string, input: GoalVersionInput) {
  return apiFetch<GoalVersion>(`/goals/${goalId}`, { method: "PATCH", body: input });
}
