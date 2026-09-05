import { apiFetch } from "./client";
import type { DailyHistoryDay, RecordEntry, TodayState } from "./types";

export interface RecordInput {
  actualValue?: number;
  actualBoolean?: boolean;
}

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
