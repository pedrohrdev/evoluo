import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";
import type { Goal } from "@/lib/api/types";
import { GOAL_KIND_LABEL, IMPORTANCE_LABEL } from "@/lib/domain/labels";
import { formatValueForKind } from "@/lib/format/format";

export function GoalSlot({
  goal,
  placeholderLabel,
  optional,
  onEdit,
}: {
  goal?: Goal;
  placeholderLabel: string;
  optional?: boolean;
  onEdit: () => void;
}) {
  if (!goal?.currentVersion) {
    return (
      <button
        onClick={onEdit}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-dashed border-line px-4 py-3.5 text-left transition-colors hover:border-line-strong hover:bg-surface-1"
      >
        <span className="text-sm text-ink-muted">
          {placeholderLabel}
          {optional ? <span className="text-ink-faint"> (opcional)</span> : null}
        </span>
        <Plus className="size-4 text-ink-faint" aria-hidden />
      </button>
    );
  }

  const v = goal.currentVersion;

  return (
    <Surface className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{v.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <Badge tone="neutral">{GOAL_KIND_LABEL[v.kind]}</Badge>
          <Badge tone="neutral">{IMPORTANCE_LABEL[v.importance]}</Badge>
          {v.kind !== "boolean" ? <span>alvo: {formatValueForKind(v.kind, v.targetValue)}</span> : null}
        </div>
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 rounded-sm p-2 text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink"
        aria-label={`Editar ${v.title}`}
      >
        <Pencil className="size-4" />
      </button>
    </Surface>
  );
}
