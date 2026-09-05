import { apiFetch } from "./client";
import type { ParticipantPoints, PointsConfigRow } from "./types";

export function getPointsConfig() {
  return apiFetch<PointsConfigRow[]>("/points-config");
}

export function getParticipantPoints(participantId: string) {
  return apiFetch<ParticipantPoints>(`/challenge-participants/${participantId}/points`);
}
