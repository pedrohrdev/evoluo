import { apiFetch } from "./client";
import type { FeedEvent } from "./types";

export function getChallengeFeed(challengeId: string, limit = 30) {
  return apiFetch<FeedEvent[]>(`/challenges/${challengeId}/feed?limit=${limit}`);
}
