"use client";

import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SpecialGoal, SpecialGoalStatus } from "@/lib/api/types";

const STATUS_BADGE: Record<SpecialGoalStatus, { label: string; tone: "accent" | "success" | "neutral" }> = {
  pending: { label: "Pendente", tone: "accent" },
  completed: { label: "Cumprida", tone: "success" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export function SpecialGoalRow({
  goal,
  fromName,
  toName,
  canComplete,
  canCancel,
  onComplete,
  onCancel,
  completing,
  cancelling,
}: {
  goal: SpecialGoal;
  fromName: string;
  toName: string;
  canComplete: boolean;
  canCancel: boolean;
  onComplete: () => void;
  onCancel: () => void;
  completing: boolean;
  cancelling: boolean;
}) {
  const status = STATUS_BADGE[goal.status];

  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-surface-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{goal.title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {fromName} → {toName}
        </p>
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
      {canComplete ? (
        <Button size="sm" variant="secondary" loading={completing} onClick={onComplete}>
          <Check className="size-4" aria-hidden />
          Cumpri
        </Button>
      ) : null}
      {canCancel ? (
        <Button size="sm" variant="ghost" loading={cancelling} onClick={onCancel} aria-label="Cancelar meta especial">
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}
