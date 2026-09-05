"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { GoalFormModal } from "@/components/goals/goal-form-modal";
import { GoalSlot } from "@/components/goals/goal-slot";
import { listGoals } from "@/lib/api/goals";
import type { Goal, GoalPeriod } from "@/lib/api/types";
import { useChallenge } from "@/lib/challenge/challenge-context";

const DAILY_LABELS = ["Meta diária 1", "Meta diária 2", "Meta diária 3"];

export default function GoalsSetupPage() {
  const { challengeId, participation } = useChallenge();
  const router = useRouter();
  const queryClient = useQueryClient();
  const participantId = participation?.participantId;

  const [editing, setEditing] = useState<{ periodType: GoalPeriod; goal?: Goal } | null>(null);

  const { data: goals, isLoading, isError, refetch } = useQuery({
    queryKey: ["goals", participantId],
    queryFn: () => listGoals(participantId!),
    enabled: !!participantId,
  });

  if (isLoading || !participantId) return <LoadingState label="Carregando metas…" />;
  if (isError || !goals) return <ErrorState message="Não foi possível carregar as metas." onRetry={() => void refetch()} />;

  const daily = goals.filter((g) => g.periodType === "daily");
  const weekly = goals.find((g) => g.periodType === "weekly");
  const monthly = goals.find((g) => g.periodType === "monthly");
  const duration = goals.find((g) => g.periodType === "challenge");
  const dailyComplete = daily.length >= 3;

  function handleSaved() {
    void queryClient.invalidateQueries({ queryKey: ["goals", participantId] });
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-semibold text-ink">Configure suas metas</h1>
      <p className="mt-1 text-sm text-ink-muted">
        As 3 metas diárias são obrigatórias — elas definem seu streak. As demais são opcionais.
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Diárias (obrigatórias)</h2>
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((index) => (
            <GoalSlot
              key={index}
              goal={daily[index]}
              placeholderLabel={DAILY_LABELS[index]}
              onEdit={() => setEditing({ periodType: "daily", goal: daily[index] })}
            />
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Opcionais</h2>
        <div className="flex flex-col gap-2">
          <GoalSlot
            goal={weekly}
            placeholderLabel="Meta semanal"
            optional
            onEdit={() => setEditing({ periodType: "weekly", goal: weekly })}
          />
          <GoalSlot
            goal={monthly}
            placeholderLabel="Meta mensal"
            optional
            onEdit={() => setEditing({ periodType: "monthly", goal: monthly })}
          />
          <GoalSlot
            goal={duration}
            placeholderLabel="Meta de duração do desafio"
            optional
            onEdit={() => setEditing({ periodType: "challenge", goal: duration })}
          />
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-3 rounded-md border border-line bg-surface-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          {dailyComplete ? (
            <>
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              <span className="text-ink">Metas diárias configuradas.</span>
            </>
          ) : (
            <span className="text-ink-muted">Faltam {3 - daily.length} meta(s) diária(s).</span>
          )}
        </div>
        <Button disabled={!dailyComplete} onClick={() => router.push(`/c/${challengeId}`)} className="w-full sm:w-auto">
          Ir para o painel
        </Button>
      </div>

      {editing ? (
        <GoalFormModal
          open
          onOpenChange={(open) => !open && setEditing(null)}
          participantId={participantId}
          periodType={editing.periodType}
          existingGoal={editing.goal}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
