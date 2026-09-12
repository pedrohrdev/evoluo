"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame, Gift, MinusCircle } from "lucide-react";
import { getChallengeFeed } from "@/lib/api/feed";
import type { FeedEvent } from "@/lib/api/types";
import { EmptyState } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";
import { pluralize } from "@/lib/format/format";

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ontem" : `${days} dias`;
}

const RESOLVED_LABEL: Record<string, string> = {
  completed: "cumpriu",
  declined: "recusou",
  cancelled: "cancelou",
};

function describe(event: FeedEvent): { icon: typeof Flame; text: React.ReactNode } {
  switch (event.type) {
    case "day_completed":
      return {
        icon: Flame,
        text: (
          <>
            <strong className="font-medium text-ink">{event.actorName}</strong> fechou 3/3
            {event.streak ? ` · ${pluralize(event.streak, "dia seguido", "dias seguidos")}` : ""}
          </>
        ),
      };
    case "day_missed":
      return {
        icon: MinusCircle,
        text: (
          <>
            <strong className="font-medium text-ink">{event.actorName}</strong> não fechou o dia
          </>
        ),
      };
    case "special_goal_created":
      return {
        icon: Gift,
        text: (
          <>
            <strong className="font-medium text-ink">{event.actorName}</strong> mandou uma meta especial para{" "}
            <strong className="font-medium text-ink">{event.targetName}</strong>: {event.title}
          </>
        ),
      };
    default:
      return {
        icon: Gift,
        text: (
          <>
            <strong className="font-medium text-ink">{event.actorName}</strong>{" "}
            {RESOLVED_LABEL[event.status ?? ""] ?? "resolveu"} a meta especial: {event.title}
          </>
        ),
      };
  }
}

// Feed de atividade do desafio.
//
// Entre um check-in e o próximo o produto ficava inerte por 24h: os amigos
// registravam metas, o ranking mudava, e nada disso aparecia. Este é o
// motivo para abrir o app fora da hora do check-in — e não cria nenhum dado
// novo, só reúne o que já existe.
export function ChallengeFeed({ challengeId }: { challengeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["feed", challengeId],
    queryFn: () => getChallengeFeed(challengeId, 12),
  });

  if (isLoading || !data) return null;

  if (data.length === 0) {
    return (
      <EmptyState
        icon={Flame}
        title="Nada aconteceu ainda"
        description="Assim que alguém fechar um dia, aparece aqui."
      />
    );
  }

  return (
    <Surface className="flex flex-col divide-y divide-line">
      {data.map((event, index) => {
        const { icon: Icon, text } = describe(event);
        return (
          <div key={`${event.type}-${event.at}-${index}`} className="flex items-start gap-3 px-4 py-3">
            <Icon
              className={cnIcon(event.type)}
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-sm text-ink-muted">{text}</p>
            <span className="shrink-0 text-xs tabular-nums text-ink-faint">{relativeTime(event.at)}</span>
          </div>
        );
      })}
    </Surface>
  );
}

function cnIcon(type: FeedEvent["type"]): string {
  const base = "mt-0.5 size-4 shrink-0 ";
  if (type === "day_completed") return `${base}text-accent`;
  if (type === "day_missed") return `${base}text-ink-faint`;
  return `${base}text-ink-muted`;
}
