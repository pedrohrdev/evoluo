"use client";

import { Flame, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { buttonStyles } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/cn";

const PILLARS = [
  {
    icon: Target,
    title: "3 metas por dia",
    body: "Cada pessoa escolhe as próprias. Horas, quantidade ou só sim/não — do jeito que fizer sentido para ela.",
  },
  {
    icon: Flame,
    title: "Streak que não perdoa",
    body: "Cumpriu as 3 no dia, o streak sobe. Faltou uma, volta a zero. É o que separa quem aparece todo dia de quem aparece quando dá.",
  },
  {
    icon: Trophy,
    title: "Ranking entre amigos",
    body: "Quem tem o streak mais longo lidera. Empate desempata por pontos. Todo mundo vê o progresso de todo mundo.",
  },
];

// Antes, `/` redirecionava direto para /login: quem recebia o link de um
// amigo via um formulário de e-mail e senha, sem uma linha explicando o que
// era o Evoluo. Quem já tem sessão continua indo direto para o painel — a
// landing é para quem chega de fora.
export default function RootPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/onboarding");
  }, [status, router]);

  if (status !== "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-12 sm:px-6 sm:py-20">
      <header className="flex items-center justify-between">
        <p className="font-display text-xl font-bold tracking-tight text-ink">
          evol<span className="text-accent">u</span>o
        </p>
        <Link href="/login" className="text-sm text-ink-muted hover:text-ink">
          Entrar
        </Link>
      </header>

      <main className="mt-16 flex-1 sm:mt-24">
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl">
          Disciplina vira placar.
        </h1>
        <p className="mt-4 max-w-lg text-lg text-ink-muted">
          Um desafio de 30, 50, 100 ou 365 dias com seus amigos. Cada um define as próprias metas diárias, todo mundo
          acompanha o progresso de todo mundo, e o streak decide quem está na frente.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className={cn(buttonStyles({ size: "lg" }), "w-full sm:w-auto")}>
            Criar meu desafio
          </Link>
          <Link
            href="/login"
            className={cn(buttonStyles({ variant: "secondary", size: "lg" }), "w-full sm:w-auto")}
          >
            Já tenho conta
          </Link>
        </div>

        <ul className="mt-16 flex flex-col gap-8 sm:mt-20">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
              <div>
                <h2 className="font-display font-semibold text-ink">{title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </main>

      <footer className="mt-20 border-t border-line pt-6 text-sm text-ink-muted">
        Recebeu um código de convite?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Entre e use o código
        </Link>
        .
      </footer>
    </div>
  );
}
