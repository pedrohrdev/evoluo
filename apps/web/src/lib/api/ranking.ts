import { apiFetch } from "./client";
import type { RankingEntry } from "./types";

export function getRanking(challengeId: string) {
  return apiFetch<RankingEntry[]>(`/challenges/${challengeId}/ranking`);
}
