import { apiFetch } from "./client";
import type { PublicProfile } from "./types";

export function getProfile(id: string) {
  return apiFetch<PublicProfile>(`/profiles/${id}`);
}

export function getOwnProfile() {
  return apiFetch<Pick<PublicProfile, "id" | "displayName" | "avatarUrl" | "createdAt" | "updatedAt">>(
    "/profiles/me",
  );
}

export function updateOwnProfile(input: { displayName?: string; avatarUrl?: string }) {
  return apiFetch<PublicProfile>("/profiles/me", { method: "PATCH", body: input });
}
