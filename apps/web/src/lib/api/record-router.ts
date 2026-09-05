import * as records from "./records";
import type { GoalPeriod } from "./types";

// Cada periodicidade tem seu próprio endpoint de registro (etapas 6/12/13)
// — este mapa só evita um switch repetido nos componentes que registram
// metas de qualquer periodicidade (ex.: o painel).
export const RECORD_FN: Record<GoalPeriod, typeof records.recordDaily> = {
  daily: records.recordDaily,
  weekly: records.recordWeekly,
  monthly: records.recordMonthly,
  challenge: records.recordChallenge,
};
