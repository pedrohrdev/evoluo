"use client";

import { ArrowLeft, Ban } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { use } from "react";
import { Avatar } from "@/components/profile/avatar";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { cn } from "@/lib/cn";
import { ProfileParticipationProvider, useProfileParticipation } from "@/lib/profile/profile-participation-context";

// "Perfil" sai do escopo do desafio (é `/profiles/:id`, não
// `/profiles/:id/challenges/:challengeId/...`), por isso o `absolute`. Sem
// ela, o perfil de outra pessoa não tinha nenhuma entrada na interface:
// o redirect que trazia a pessoa até aqui engolia a página de perfil.
const TABS: { href: string; label: string; absolute?: boolean }[] = [
  { href: "", label: "Painel" },
  { href: "/history", label: "Histórico" },
  { href: "/analytics", label: "Análises" },
  { href: "/profiles/:id", label: "Perfil", absolute: true },
];

// Contraparte somente-leitura de app/c/[challengeId]/layout.tsx: ali o
// ChallengeGate resolve SEMPRE a participação do usuário logado e bloqueia
// quem não participa do desafio. Aqui o dono da participação é quem estava
// no perfil visitado (profileId), nunca o usuário logado — é assim que se
// vê metas/histórico/análises de outra pessoa (CLAUDE.md seção 2
// "Perfis": público para qualquer usuário autenticado).
function ParticipationGate({
  profileId,
  challengeId,
  children,
}: {
  profileId: string;
  challengeId: string;
  children: React.ReactNode;
}) {
  const { profile, participation, isLoading, isError } = useProfileParticipation();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/profiles/${profileId}/challenges/${challengeId}`;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Carregando…" />
      </div>
    );
  }

  if (isError || !profile || !participation) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <EmptyState
          icon={Ban}
          title="Desafio não encontrado neste perfil"
          description="Confira o link ou volte ao perfil."
          action={
            <Link href={`/profiles/${profileId}`} className="text-sm font-medium text-accent hover:underline">
              Voltar ao perfil
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* router.back() em vez de <Link href={`/profiles/${profileId}`}>: um Link
          empurraria uma NOVA entrada de histórico idêntica à página de perfil
          que já está na pilha (chegamos aqui a partir dela), então o botão
          "Voltar" da própria página de perfil (que também usa router.back())
          desfaria só esse push e devolveria pra cá de novo — um loop entre
          as duas telas. Usando router.back() aqui também, cada "voltar"
          desempilha de verdade, inclusive até o desafio/ranking de quem está
          navegando. */}
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {profile.displayName}
      </button>

      <div className="mb-4 flex items-center gap-3">
        <Link href={`/profiles/${profileId}`} className="shrink-0 rounded-full transition-opacity hover:opacity-80">
          <Avatar
            displayName={profile.displayName}
            avatarUrl={profile.avatarUrl}
            className="size-11"
            textClassName="text-base"
          />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold text-ink">{profile.displayName}</h1>
          <p className="truncate text-sm text-ink-muted">{participation.challengeName}</p>
        </div>
      </div>

      {/* Trocar de desafio sem passar pela lista do perfil (pedido do
          usuário): só aparece quando a pessoa participa de mais de um. Link
          (push) mesmo — é uma navegação lateral, não um "voltar", então
          continua empilhando normalmente pro botão de voltar acima
          funcionar em qualquer um deles. */}
      {profile.challenges.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Desafios">
          {profile.challenges.map((c) => (
            <Link
              key={c.participantId}
              href={`/profiles/${profileId}/challenges/${c.challengeId}`}
              aria-current={c.challengeId === challengeId ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                c.challengeId === challengeId
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {c.challengeName}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mb-6 flex items-center gap-1 border-b border-line">
        {TABS.map((tab) => {
          const href = tab.absolute ? tab.href.replace(":id", profileId) : `${base}${tab.href}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}

export default function ProfileChallengeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string; challengeId: string }>;
}) {
  const { id, challengeId } = use(params);
  const { isReady } = useRequireAuth();

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  return (
    <ProfileParticipationProvider profileId={id} challengeId={challengeId}>
      <ParticipationGate profileId={id} challengeId={challengeId}>
        {children}
      </ParticipationGate>
    </ProfileParticipationProvider>
  );
}
