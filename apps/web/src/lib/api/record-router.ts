import * as records from "./records";
import type { GoalPeriod } from "./types";

// Todas as periodicidades usam o mesmo formato de registro avulso por
// goalId (check-in único por dia foi revertido — ver records.ts).
export const RECORD_FN: Record<GoalPeriod, typeof records.recordWeekly> = {
  daily: records.recordDaily,
  weekly: records.recordWeekly,
  monthly: records.recordMonthly,
  challenge: records.recordChallenge,
};
