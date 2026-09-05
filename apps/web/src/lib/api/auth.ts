import { apiFetch } from "./client";
import type { Session } from "../auth/session";

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

interface SupabaseUser {
  id: string;
  email?: string;
}

interface AuthResponse {
  user: SupabaseUser;
  session: SupabaseSession | null;
}

function toSession(response: AuthResponse): Session | null {
  if (!response.session) return null;
  return {
    accessToken: response.session.access_token,
    refreshToken: response.session.refresh_token,
    expiresAt: response.session.expires_at ?? null,
    userId: response.user.id,
    email: response.user.email ?? null,
  };
}

export async function signUp(input: { email: string; password: string; displayName?: string }) {
  const response = await apiFetch<AuthResponse>("/auth/signup", {
    method: "POST",
    body: input,
    auth: false,
  });
  return toSession(response);
}

export async function signIn(input: { email: string; password: string }) {
  const response = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: input,
    auth: false,
  });
  return toSession(response);
}

export async function signOut() {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}
