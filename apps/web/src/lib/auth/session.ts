// Sessão guardada no localStorage do navegador. Escopo desta etapa (UX/UI):
// autenticação client-side simples, sem cookies/SSR-protected routes — uma
// simplificação deliberada, não uma regra de negócio (a validação real de
// cada requisição continua sendo feita pelo SupabaseAuthGuard no backend).
export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  userId: string;
  email: string | null;
}

const STORAGE_KEY = "evoluo.session";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeSession(session: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
