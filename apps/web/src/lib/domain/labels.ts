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

// Rótulo por extenso pra identificar de cara, na seção "Metas de período",
// qual das três é qual (semanal/mensal/duração) — a de duração é dinâmica
// porque o desafio pode durar 30, 50, 100 ou 365 dias.
export function goalPeriodDisplayLabel(periodType: GoalPeriod, challengeDurationDays?: number): string {
  switch (periodType) {
    case "daily":
      return "Meta diária";
    case "weekly":
      return "Meta semanal";
    case "monthly":
      return "Meta mensal";
    case "challenge":
      return challengeDurationDays ? `Meta pros ${challengeDurationDays} dias` : "Meta do desafio";
  }
}
