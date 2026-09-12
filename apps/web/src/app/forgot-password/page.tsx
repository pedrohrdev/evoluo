"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { forgotPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      // A API responde igual exista ou não a conta, então o único erro
      // possível aqui é de rede ou de limite de envio.
      setError(
        err instanceof ApiError && err.status === 429
          ? "Muitas tentativas seguidas. Espere um minuto e tente de novo."
          : "Não conseguimos enviar o e-mail agora. Verifique sua conexão e tente de novo.",
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
          <p className="mt-1 text-sm text-ink-muted">Recuperar acesso.</p>
        </div>

        {sent ? (
          // Nunca confirmamos que o e-mail existe — isso transformaria a
          // tela num verificador de quem tem conta no Evoluo. O texto vale
          // para os dois casos.
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-6 text-sm">
            <p className="font-medium text-ink">Se existir uma conta com esse e-mail, o link já está a caminho.</p>
            <p className="text-ink-muted">
              O link vale por pouco tempo. Se não chegar em alguns minutos, confira a caixa de spam ou tente de novo.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-line bg-surface-1 p-6">
            <p className="text-sm text-ink-muted">
              Digite seu e-mail e enviamos um link para você criar uma senha nova.
            </p>
            <Field label="E-mail" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={loading} className="mt-2 w-full">
              Enviar link
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-muted">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
