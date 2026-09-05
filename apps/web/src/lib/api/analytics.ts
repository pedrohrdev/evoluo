import { apiFetch } from "./client";
import type { GoalAnalytics } from "./types";

export function getParticipantAnalytics(participantId: string) {
  return apiFetch<GoalAnalytics[]>(`/challenge-participants/${participantId}/analytics`);
}
