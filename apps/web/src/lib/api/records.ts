import { apiFetch } from "./client";
import type { DailyHistoryDay, DaySeries, RecordEntry, TodayState } from "./types";

export interface RecordInput {
  actualValue?: number;
  actualBoolean?: boolean;
}

// Check-in único por dia (CLAUDE.md seção "Streak"): substitui o antigo
// PUT /goals/:goalId/daily-record por meta avulsa — agora as metas
// diárias só são registradas em bloco, uma vez por dia, e o próprio envio
// já fecha o dia (streak/pontos instantâneos). Rejeita com 409 se o dia já
// foi fechado (ver check-in-modal.tsx).
export function checkInDaily(participantId: string, records: ({ goalId: string } & RecordInput)[]) {
  return apiFetch<TodayState>(`/challenge-participants/${participantId}/daily-check-in`, {
    method: "PUT",
    body: { records },
  });
}

export function recordWeekly(goalId: string, input: RecordInput) {
  return apiFetch<RecordEntry>(`/goals/${goalId}/weekly-record`, { method: "PUT", body: input });
}

export function recordMonthly(goalId: string, input: RecordInput) {
  return apiFetch<RecordEntry>(`/goals/${goalId}/monthly-record`, { method: "PUT", body: input });
}

export function recordChallenge(goalId: string, input: RecordInput) {
  return apiFetch<RecordEntry>(`/goals/${goalId}/challenge-record`, { method: "PUT", body: input });
}

export function getDailyHistory(participantId: string) {
  return apiFetch<DailyHistoryDay[]>(`/challenge-participants/${participantId}/daily-history`);
}

export function getTodayState(participantId: string) {
  return apiFetch<TodayState>(`/challenge-participants/${participantId}/today`);
}

// Série compacta para o heatmap (uma célula por dia fechado) — separada do
// histórico, que carrega também todos os registros de cada dia.
export function getDaySeries(participantId: string) {
  return apiFetch<DaySeries>(`/challenge-participants/${participantId}/day-series`);
}
