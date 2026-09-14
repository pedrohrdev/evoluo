import { apiFetch } from "./client";
import type { DailyHistoryDay, DaySeries, RecordEntry, TodayState } from "./types";

export interface RecordInput {
  actualValue?: number;
  actualBoolean?: boolean;
}

// Regra revisada (CLAUDE.md seção "Streak"): check-in único por dia foi
// revertido — cada meta diária volta a ser um registro avulso por goalId,
// igual semanal/mensal/de desafio, podendo ser corrigida quantas vezes
// quiser ao longo do dia. Streak/pontos reagem em tempo real no banco.
export function recordDaily(goalId: string, input: RecordInput) {
  return apiFetch<RecordEntry>(`/goals/${goalId}/daily-record`, { method: "PUT", body: input });
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
