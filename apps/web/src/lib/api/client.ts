import { clearSession, readSession, writeSession } from "../auth/session";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Disparado quando não há sessão válida (nenhum token, ou refresh falhou) —
// a UI trata isso redirecionando para /login, nunca tentando adivinhar um
// estado de usuário.
export class AuthRequiredError extends Error {
  constructor() {
    super("Sessão expirada.");
    this.name = "AuthRequiredError";
  }
}

let refreshInFlight: Promise<string | null> | null = null;

// Único ponto de refresh — se várias chamadas em paralelo receberem 401 ao
// mesmo tempo, só uma delas dispara POST /auth/refresh; as demais aguardam
// o mesmo resultado.
async function refreshAccessToken(): Promise<string | null> {
  const session = readSession();
  if (!session) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });

        if (!response.ok) {
          clearSession();
          return null;
        }

        const data = await response.json();
        const newSession = {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at ?? null,
          userId: data.user.id,
          email: data.user.email ?? null,
        };
        writeSession(newSession);
        return newSession.accessToken;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean; // default true
}

// Wrapper único para toda chamada à API (proxeada via /api, ver
// next.config.ts). Anexa o Bearer token, tenta um refresh automático em
// caso de 401, e lança AuthRequiredError se mesmo assim não conseguir —
// a página que chamou decide o que fazer (normalmente redirecionar para
// /login).
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";

    if (auth) {
      const session = readSession();
      if (!session) throw new AuthRequiredError();
      headers.Authorization = `Bearer ${session.accessToken}`;
    }

    return fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let response = await doFetch();

  if (response.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new AuthRequiredError();
    response = await doFetch();
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message = (payload && (payload.message as string)) || response.statusText || "Erro inesperado.";
    throw new ApiError(Array.isArray(message) ? message.join(" ") : message, response.status);
  }

  return payload as T;
}
