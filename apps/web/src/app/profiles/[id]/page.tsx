"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Swords } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/profile/avatar";
import { EditProfileModal } from "@/components/profile/edit-profile-modal";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { StreakFlame } from "@/components/streak/streak-flame";
import { getProfile, profileQueryKey } from "@/lib/api/profiles";
import type { ProfileChallengeParticipation } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { formatDateLong } from "@/lib/format/format";

// Qual desafio mostrar de cara quando a pessoa está em mais de um: o mais
// recentemente ativo (último check-in diário). Quem nunca fez check-in em
// nenhum entra pelo mais recém-entrado — `profile.challenges` já vem
// ordenado por joinedAt desc (ProfilesService.getPublicProfile), então
// challenges[0] já é esse.
function pickDefaultChallenge(
  challenges: ProfileChallengeParticipation[],
): ProfileChallengeParticipation | undefined {
  if (challenges.length === 0) return undefined;

  const withCheckIn = challenges.filter((c): c is ProfileChallengeParticipation & { lastCheckInDate: string } =>
    Boolean(c.lastCheckInDate),
  );
  if (withCheckIn.length === 0) return challenges[0];

  return withCheckIn.reduce((latest, c) => (c.lastCheckInDate > latest.lastCheckInDate ? c : latest));
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { isReady } = useRequireAuth();
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: profileQueryKey(id),
    queryFn: () => getProfile(id),
    enabled: isReady,
  });

  const isOwn = session?.userId === id;

  // Perfil de outra pessoa: pula a listagem de desafios (que exigiria mais
  // um clique só pra ver as metas) e vai direto pras metas do desafio mais
  // recentemente ativo dela — pedido do usuário. Os demais desafios (se
  // houver) viram opção pra trocar dentro da própria tela de metas
  // (ver profiles/[id]/challenges/[challengeId]/layout.tsx). router.replace
  // (não push) pra essa página nunca fique presa no histórico entre o
  // desafio e quem visitou o perfil.
  useEffect(() => {
    if (!isOwn && profile && profile.challenges.length > 0) {
      const target = pickDefaultChallenge(profile.challenges);
      if (target) router.replace(`/profiles/${id}/challenges/${target.challengeId}`);
    }
  }, [isOwn, profile, id, router]);

  if (!isReady || isLoading) return <LoadingState label="Carregando perfil…" />;
  if (isError || !profile) return <ErrorState message="Não foi possível carregar este perfil." onRetry={() => void refetch()} />;
  if (!isOwn && profile.challenges.length > 0) return <LoadingState label="Carregando perfil…" />;
  const bestStreak = Math.max(0, ...profile.challenges.map((c) => c.currentStreak));
  const totalPoints = profile.challenges.reduce((sum, c) => sum + c.totalPoints, 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Voltar
      </button>

      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar displayName={profile.displayName} avatarUrl={profile.avatarUrl} className="size-14" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold text-ink">{profile.displayName}</h1>
            <p className="text-sm text-ink-muted">Desde {formatDateLong(profile.createdAt)}</p>
          </div>
        </div>
        {isOwn ? (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            Editar
          </Button>
        ) : null}
      </div>

      <Surface className="mt-6 grid grid-cols-3 gap-3 p-4 sm:gap-4 sm:p-5">
        <HeroStat label="Maior streak ativo" value={<StreakFlame value={bestStreak} />} />
        <HeroStat label="Pontos (soma)" value={totalPoints} />
        <HeroStat label="Desafios" value={profile.challenges.length} />
      </Surface>

      {/* Só chega aqui em duas situações: é o próprio dono do perfil (que
          quer ver/gerenciar todos os desafios dele, não só o mais ativo),
          ou a pessoa visitada não está em nenhum desafio ainda — perfil de
          outra pessoa COM desafio nunca renderiza esta lista, o effect
          acima já redireciona direto pras metas antes disso. */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Desafios</h2>
        {profile.challenges.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum desafio ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {profile.challenges.map((c) => (
              <li key={c.participantId}>
                <Link
                  href={`/c/${c.challengeId}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-1 px-4 py-3.5 transition-colors hover:border-line-strong"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Swords className="size-4 shrink-0 text-ink-faint" aria-hidden />
                      <p className="truncate font-medium text-ink">{c.challengeName}</p>
                      {c.status === "inactive" ? <Badge tone="neutral">Você saiu</Badge> : null}
                    </div>
                    <p className="mt-0.5 pl-6 text-xs text-ink-muted">
                      {c.totalDaysCompleted} dia(s) concluído(s) · {c.goals.length} meta(s)
                    </p>
                  </div>
                  <StreakFlame value={c.currentStreak} size="sm" className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwn ? (
        <EditProfileModal
          open={editing}
          onOpenChange={setEditing}
          profile={profile}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: profileQueryKey(id) })}
        />
      ) : null}
    </div>
  );
}
