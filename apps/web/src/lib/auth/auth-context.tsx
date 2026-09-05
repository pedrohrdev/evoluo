"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as authApi from "../api/auth";
import { clearSession, readSession, writeSession, type Session } from "./session";

interface AuthContextValue {
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  useEffect(() => {
    // Hidratação intencional a partir de uma fonte só disponível no
    // navegador (localStorage) — o primeiro render precisa continuar
    // "loading" para bater com o HTML gerado no servidor (sem isso,
    // divergiria na hidratação); só depois de montado é que sabemos se há
    // sessão.
    const existing = readSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(existing);
    setStatus(existing ? "authenticated" : "unauthenticated");
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const newSession = await authApi.signIn({ email, password });
    if (!newSession) throw new Error("Não foi possível iniciar a sessão.");
    writeSession(newSession);
    setSession(newSession);
    setStatus("authenticated");
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const newSession = await authApi.signUp({ email, password, displayName });
    if (!newSession) {
      // Confirmação de e-mail habilitada no projeto Supabase: sem sessão
      // ainda, a pessoa precisa confirmar e então entrar pela tela de login.
      return { needsEmailConfirmation: true };
    }
    writeSession(newSession);
    setSession(newSession);
    setStatus("authenticated");
    return { needsEmailConfirmation: false };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.signOut();
    } catch {
      // Mesmo se a chamada falhar (ex.: token já expirado), limpamos a
      // sessão local — o objetivo do usuário é sair, não depende do backend.
    }
    clearSession();
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ session, status, signIn, signUp, signOut }),
    [session, status, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}
