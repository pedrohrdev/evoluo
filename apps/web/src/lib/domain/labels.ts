import type { GoalKind, GoalPeriod, Importance } from "@/lib/api/types";

// Rótulos em pt-BR para os enums do domínio — centralizados aqui para
// nunca divergir entre telas (antes duplicados em goal-record-card,
// goal-slot, goal-form-modal e goal-analytics-card).
export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  hours: "Horas",
  quantity: "Quantidade",
  boolean: "Sim/não",
};

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  challenge: "Duração",
};
