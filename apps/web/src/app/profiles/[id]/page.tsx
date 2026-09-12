"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Pencil, Swords } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/profile/avatar";
import { EditProfileModal } from "@/components/profile/edit-profile-modal";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { StreakFlame } from "@/components/streak/streak-flame";
import { getProfile, profileQueryKey } from "@/lib/api/profiles";
import { useAuth } from "@/lib/auth/auth-context";
import { useRequireAuth } from "@/lib/auth/use-require-auth";
import { pickDefaultChallenge } from "@/lib/challenge/pick-default-challenge";
import { formatDateLong } from "@/lib/format/format";

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

  if (!isReady || isLoading) return <LoadingState label="Carregando perfil…" />;
  if (isError || !profile) return <ErrorState message="Não foi possível carregar este perfil." onRetry={() => void refetch()} />;

  // O atalho "ver as metas direto" continua existindo — mas como um LINK
  // em destaque, não como um redirect. Antes, um useEffect mandava qualquer
  // perfil de outra pessoa com pelo menos um desafio direto para as metas
  // dela, e o corpo desta página virava código morto: não havia nenhuma
  // rota no app que mostrasse a foto, a data de entrada ou os números
  // agregados de outro participante.
  const defaultChallenge = pickDefaultChallenge(profile.challenges);

  // Só participações ativas: um streak de um desafio que a pessoa deixou não
  // é um "streak ativo".
  const activeChallenges = profile.challenges.filter((c) => c.status === "active");
  const bestStreak = Math.max(0, ...activeChallenges.map((c) => c.currentStreak));
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

      {!isOwn && defaultChallenge ? (
        <Link
          href={`/profiles/${id}/challenges/${defaultChallenge.challengeId}`}
          className="mt-4 flex items-center justify-between gap-3 rounded-md border border-line bg-surface-1 px-4 py-3.5 transition-colors hover:border-line-strong"
        >
          <span className="min-w-0 text-sm">
            <span className="font-medium text-ink">Ver metas, histórico e análises</span>
            <span className="mt-0.5 block truncate text-xs text-ink-muted">{defaultChallenge.challengeName}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </Link>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Desafios</h2>
        {profile.challenges.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum desafio ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {profile.challenges.map((c) => (
              <li key={c.participantId}>
                <Link
                  href={isOwn ? `/c/${c.challengeId}` : `/profiles/${id}/challenges/${c.challengeId}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-1 px-4 py-3.5 transition-colors hover:border-line-strong"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Swords className="size-4 shrink-0 text-ink-faint" aria-hidden />
                      <p className="truncate font-medium text-ink">{c.challengeName}</p>
                      {c.status === "inactive" ? (
                        <Badge tone="neutral">{isOwn ? "Você saiu" : "Saiu"}</Badge>
                      ) : null}
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
