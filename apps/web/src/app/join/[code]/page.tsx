"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { joinChallenge, previewChallenge } from "@/lib/api/challenges";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/cn";
import { formatDateLong, pluralize } from "@/lib/format/format";

// Página pública de convite.
//
// O Evoluo só funciona com amigos — um desafio de uma pessoa não tem
// ranking, não tem metas especiais, não tem nada — então o convite é o
// gargalo do produto inteiro. Antes ele era: copiar 8 caracteres, mandar no
// WhatsApp, o amigo se cadastrar, procurar "Entrar em um desafio" e colar.
//
// Aqui a pessoa abre o link, vê no que está entrando, e entra. Quem não tem
// conta se cadastra e volta para cá pelo `?next=` — o código fica na URL o
// tempo todo, então nada se perde no caminho.
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { session, status } = useAuth();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joinCode = (code ?? "").toUpperCase();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["challenge-preview", joinCode],
    queryFn: () => previewChallenge(joinCode),
    retry: false,
  });

  async function handleJoin() {
    setError(null);
    setJoining(true);
    try {
      const participant = await joinChallenge(joinCode);
      router.replace(`/c/${participant.challengeId}/setup`);
    } catch (err) {
      // Já participar não é erro do ponto de vista de quem clicou: leva
      // para o desafio em vez de mostrar uma falha.
      if (err instanceof ApiError && err.status === 409) {
        router.replace("/onboarding?all=1");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar no desafio. Tente de novo.");
      setJoining(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold tracking-tight text-ink">
            evol<span className="text-accent">u</span>o
          </p>
          <p className="mt-1 text-sm text-ink-muted">Você foi convidado para um desafio.</p>
        </div>

        {isLoading ? <LoadingState label="Carregando convite…" /> : null}

        {isError ? (
          <ErrorState message="Este convite não vale mais — o código pode estar errado ou o desafio foi apagado." />
        ) : null}

        {data ? (
          <Surface className="flex flex-col gap-4 p-6">
            <div>
              <h1 className="font-display text-xl font-semibold text-ink">{data.name}</h1>
              {data.description ? <p className="mt-1 text-sm text-ink-muted">{data.description}</p> : null}
            </div>

            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2 text-ink-muted">
                <CalendarDays className="size-4 shrink-0 text-ink-faint" aria-hidden />
                <dd>
                  {pluralize(data.durationDays, "dia", "dias")}, a partir de {formatDateLong(data.startDate)}
                </dd>
              </div>
              <div className="flex items-center gap-2 text-ink-muted">
                <Users className="size-4 shrink-0 text-ink-faint" aria-hidden />
                <dd>
                  {data.participantCount === 1
                    ? "1 pessoa já está dentro"
                    : `${data.participantCount} pessoas já estão dentro`}
                </dd>
              </div>
            </dl>

            <p className="text-sm text-ink-muted">
              Dentro do desafio você define suas próprias 3 metas diárias. Cumprir as 3 todo dia mantém seu streak — e
              é isso que decide o ranking.
            </p>

            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

            {status === "loading" ? (
              <LoadingState label="Carregando…" />
            ) : session ? (
              <Button loading={joining} onClick={() => void handleJoin()} className="w-full">
                Entrar no desafio
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/signup?next=${encodeURIComponent(`/join/${joinCode}`)}`}
                  className={cn(buttonStyles({ variant: "primary", size: "md" }), "w-full")}
                >
                  Criar conta e entrar
                </Link>
                <Link
                  href={`/login?next=${encodeURIComponent(`/join/${joinCode}`)}`}
                  className="text-center text-sm text-ink-muted hover:text-ink hover:underline"
                >
                  Já tenho conta
                </Link>
              </div>
            )}
          </Surface>
        ) : null}
      </div>
    </div>
  );
}
