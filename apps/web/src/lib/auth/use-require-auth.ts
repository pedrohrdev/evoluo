"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-context";

// Guarda de rota client-side: enquanto `status` é "loading" nada acontece
// (evita redirecionar antes de ler o localStorage); assim que fica claro
// que não há sessão, manda para /login.
export function useRequireAuth() {
  const { session, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return { session, isReady: status === "authenticated" };
}
