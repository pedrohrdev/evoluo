import { apiFetch } from "./client";
import type { OwnDashboard, PublicProfile } from "./types";

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

// Superset de PublicProfile: mesmo formato de challenges[], mais o painel
// do desafio padrão embutido (ver DefaultChallengeDashboard). Usado nas
// duas telas do próprio painel (onboarding e /c/:id) sob a MESMA chave de
// cache de profileQueryKey — quem só lê `.challenges` nem percebe o campo
// extra.
export function getOwnDashboard() {
  return apiFetch<OwnDashboard>("/profiles/me/dashboard");
}

type OwnProfile = Pick<PublicProfile, "id" | "displayName" | "avatarUrl" | "createdAt" | "updatedAt">;

export function getOwnProfile() {
  return apiFetch<OwnProfile>("/profiles/me");
}

export function updateOwnProfile(input: { displayName?: string }) {
  return apiFetch<OwnProfile>("/profiles/me", { method: "PATCH", body: input });
}

// Upload de verdade (multipart), não uma URL avulsa — o backend valida
// tipo/tamanho e sobe pro Supabase Storage antes de gravar avatar_url.
export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<OwnProfile>("/profiles/me/avatar", { method: "POST", body: formData });
}
