import { apiFetch } from "./client";
import type { PublicProfile } from "./types";

// Chave de cache única para GET /profiles/:id — usada em toda tela que lê
// o perfil de um usuário (perfil público, linha do ranking, bootstrap do
// desafio ativo) para que o React Query nunca busque/guarde o mesmo perfil
// duas vezes sob chaves diferentes (etapa 18 "Performance").
export function profileQueryKey(userId: string) {
  return ["profile", userId] as const;
}

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
