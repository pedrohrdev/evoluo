"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { GoalAnalyticsCard } from "@/components/analytics/goal-analytics-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/feedback";
import { getParticipantAnalytics } from "@/lib/api/analytics";
import type { GoalPeriod } from "@/lib/api/types";
import { useChallenge } from "@/lib/challenge/challenge-context";

const FILTERS: { value: GoalPeriod | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "daily", label: "Diárias" },
  { value: "weekly", label: "Semanais" },
  { value: "monthly", label: "Mensais" },
  { value: "challenge", label: "Duração" },
];

export default function AnalyticsPage() {
  const { participation } = useChallenge();
  const participantId = participation?.participantId;
  const [filter, setFilter] = useState<GoalPeriod | "all">("all");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics", participantId],
    queryFn: () => getParticipantAnalytics(participantId!),
    enabled: !!participantId,
  });

  const filtered = (data ?? []).filter((g) => filter === "all" || g.periodType === filter);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <BarChart3 className="size-5 text-accent" aria-hidden />
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Análises</h1>
          <p className="text-sm text-ink-muted">Valores reais registrados, mesmo quando a meta não foi concluída.</p>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as GoalPeriod | "all")} className="mb-5">
        <TabsList>
          {FILTERS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? <LoadingState label="Carregando análises…" /> : null}
      {isError ? <ErrorState message="Não foi possível carregar as análises." onRetry={() => void refetch()} /> : null}

      {!isLoading && filtered.length === 0 ? (
        <EmptyState icon={BarChart3} title="Nada por aqui ainda" description="Assim que houver registros para este filtro, as análises aparecem aqui." />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {filtered.map((analytics) => (
          <GoalAnalyticsCard key={analytics.id} analytics={analytics} />
        ))}
      </div>
    </div>
  );
}
