import { apiFetch } from "./client";
import type { ParticipantStreak } from "./types";

export function getStreak(participantId: string) {
  return apiFetch<ParticipantStreak>(`/challenge-participants/${participantId}/streak`);
}
