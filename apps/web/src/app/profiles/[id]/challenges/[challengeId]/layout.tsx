"use client";

import { ArrowLeft, Ban } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import { EmptyState, LoadingState } from "@/components/ui/feedback";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { cn } from "@/lib/cn";
import { ProfileParticipationProvider, useProfileParticipation } from "@/lib/profile/profile-participation-context";

const TABS = [
  { href: "", label: "Painel" },
  { href: "/history", label: "Histórico" },
  { href: "/analytics", label: "Análises" },
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
      <Link href={`/profiles/${profileId}`} className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        {profile.displayName}
      </Link>

      <h1 className="mb-1 font-display text-xl font-semibold text-ink">{participation.challengeName}</h1>

      <div className="mb-6 flex items-center gap-1 border-b border-line">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
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
