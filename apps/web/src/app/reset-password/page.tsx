"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useToast } from "@/lib/toast/toast-context";

// O Supabase devolve o token de recuperação no FRAGMENTO da URL
// (#access_token=…&type=recovery), não na query string — de propósito: o
// fragmento nunca é enviado ao servidor nem aparece em log de acesso.
// Por isso a leitura acontece no cliente, depois da montagem.
function readRecoveryToken(): { token: string | null; error: string | null } {
  if (typeof window === "undefined") return { token: null, error: null };

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  // O Supabase usa o mesmo fragmento para reportar falha (link expirado,
  // já usado). Sem ler isso, a tela mostraria "link inválido" genérico.
  const errorDescription = params.get("error_description");
  if (errorDescription) {
    return { token: null, error: errorDescription };
  }

  return { token: params.get("access_token"), error: null };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { token: recoveryToken, error: hashError } = readRecoveryToken();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(recoveryToken);
    setLinkError(hashError);
    setReady(true);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmation) {
      setError("As duas senhas não são iguais.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ accessToken: token!, password });
      notify("Senha alterada. Entre com a senha nova.", "success");
      router.replace("/login");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não conseguimos alterar a senha agora. Verifique sua conexão e tente de novo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold tracking-tight text-ink">
            evol<span className="text-accent">u</span>o
          </p>
          <p className="mt-1 text-sm text-ink-muted">Criar uma senha nova.</p>
        </div>

        {ready && !token ? (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-6 text-sm">
            <p className="font-medium text-ink">Este link não vale mais.</p>
            <p className="text-ink-muted">
              {linkError ?? "Links de recuperação expiram depois de um tempo e só podem ser usados uma vez."} Peça um
              novo para continuar.
            </p>
            <Link href="/forgot-password" className="font-medium text-accent hover:underline">
              Pedir um link novo
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-line bg-surface-1 p-6">
            <Field label="Senha nova" htmlFor="password" hint="Mínimo de 8 caracteres.">
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Repita a senha nova" htmlFor="confirmation">
              <Input
                id="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={loading} disabled={!ready} className="mt-2 w-full">
              Salvar senha nova
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
