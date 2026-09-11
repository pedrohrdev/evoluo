import * as records from "./records";
import type { GoalPeriod } from "./types";

// Metas semanais/mensais/de duração continuam com registro avulso, cada
// uma no seu próprio endpoint (etapas 12/13) — só as diárias migraram
// para o check-in único (records.checkInDaily, chamado à parte em
// check-in-modal.tsx, nunca por este mapa).
export const RECORD_FN: Record<Exclude<GoalPeriod, "daily">, typeof records.recordWeekly> = {
  weekly: records.recordWeekly,
  monthly: records.recordMonthly,
  challenge: records.recordChallenge,
};
