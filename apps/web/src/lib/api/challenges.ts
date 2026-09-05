import { apiFetch } from "./client";
import type { Challenge } from "./types";

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
