"use client";

import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { Surface } from "@/components/ui/surface";
import { listGoalVersions } from "@/lib/api/goals";
import { GOAL_KIND_LABEL, IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { formatDateLong, formatValueForKind } from "@/lib/format/format";

function daysAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

// Marcador de meta editada, com a linha do tempo completa atrás de um
// clique.
//
// Mudar de meta é legítimo — compromissos aparecem, uma meta se revela mal
// calibrada na primeira semana. O que faltava não era uma trava, era
// visibilidade: o padrão Goal/GoalVersion guardava toda a trilha desde a
// etapa 5 e nenhuma tela jamais a mostrou, então dava para baixar o próprio
// alvo no meio do desafio e ninguém tinha como perceber.
//
// Enquadrado como histórico, não como acusação: ver alguém SUBIR o próprio
// alvo no meio do desafio também é uma informação boa.
export function GoalHistoryBadge({ goalId, createdAt }: { goalId: string; createdAt: string }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["goal-versions", goalId],
    queryFn: () => listGoalVersions(goalId),
    enabled: open,
    staleTime: 60_000,
  });

  // Sem buscar nada: a meta só pode ter sido editada se a versão vigente
  // começou depois da criação da própria meta. Evita uma requisição por
  // linha de meta só para descobrir que nunca houve edição.
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-ink-faint transition-colors hover:text-ink"
        title="Ver histórico de edições desta meta"
      >
        <History className="size-3" aria-hidden />
        editada {daysAgo(createdAt)}
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Histórico da meta"
        description="Toda edição abre uma versão nova — registros antigos continuam apontando para a versão que valia na época."
      >
        {isLoading ? (
          <LoadingState label="Carregando…" />
        ) : (
          <ol className="flex flex-col gap-2">
            {(data ?? []).map((version, index) => (
              <li key={version.id}>
                <Surface className="flex flex-col gap-1.5 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{version.title}</p>
                    {index === 0 && version.validUntil === null ? <Badge tone="success">atual</Badge> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                    <Badge tone="neutral">{GOAL_KIND_LABEL[version.kind]}</Badge>
                    <Badge tone="neutral">{IMPORTANCE_LABEL[version.importance]}</Badge>
                    {version.kind !== "boolean" ? (
                      <span>alvo: {formatValueForKind(version.kind, version.targetValue)}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-ink-faint">
                    {version.validUntil === null
                      ? `desde ${formatDateLong(version.validFrom)}`
                      : `${formatDateLong(version.validFrom)} → ${formatDateLong(version.validUntil)}`}
                  </p>
                </Surface>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </>
  );
}
