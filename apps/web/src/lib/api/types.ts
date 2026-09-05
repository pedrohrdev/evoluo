// Tipos espelhando exatamente os DTOs/entidades já implementados no
// backend (apps/api) — nenhuma regra nova, só a forma dos dados.

export type GoalPeriod = "daily" | "weekly" | "monthly" | "challenge";
export type GoalKind = "hours" | "quantity" | "boolean";
export type Importance = "low" | "medium" | "high";
export type ParticipantStatus = "active" | "inactive";

export interface Challenge {
  id: string;
  name: string;
  description: string | null;
  durationDays: 30 | 50 | 100 | 365;
  startDate: string;
  endDate: string;
  createdBy: string;
  joinCode: string;
  createdAt: string;
}

export interface GoalVersion {
  id: string;
  goalId: string;
  kind: GoalKind;
  importance: Importance;
  title: string;
  targetValue: number | null;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
}

export interface Goal {
  id: string;
  challengeParticipantId: string;
  periodType: GoalPeriod;
  createdAt: string;
  currentVersion: GoalVersion | null;
}

export interface RecordEntry {
  id: string;
  goalId: string;
  goalVersionId: string;
  challengeParticipantId: string;
  actualValue: number | null;
  actualBoolean: boolean | null;
  kind: GoalKind;
  importance: Importance;
  targetValueSnapshot: number | null;
  completed: boolean;
  pointsAwarded: number;
  createdAt: string;
  updatedAt: string;
}

export interface PointsConfigRow {
  importance: Importance;
  periodType: GoalPeriod;
  points: number;
}

export interface PointsLedgerEntry {
  id: string;
  challengeParticipantId: string;
  sourceTable: string;
  sourceRecordId: string;
  points: number;
  awardedForDate: string;
  createdAt: string;
}

export interface ParticipantPoints {
  participantId: string;
  totalPoints: number;
  ledger: PointsLedgerEntry[];
}

export interface TodayDayResult {
  completedGoalsCount: number;
  dayCompleted: boolean;
  closed: boolean;
}

export interface ParticipantStreak {
  participantId: string;
  currentStreak: number;
  longestStreak: number;
  today: TodayDayResult | null;
}

export interface RankingEntry {
  position: number;
  participantId: string;
  userId: string;
  currentStreak: number;
  totalPoints: number;
  totalDaysCompleted: number;
}

export interface ProfileChallengeParticipation {
  challengeId: string;
  challengeName: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  participantId: string;
  status: ParticipantStatus;
  joinedAt: string;
  leftAt: string | null;
  currentStreak: number;
  longestStreak: number;
  totalPoints: number;
  totalDaysCompleted: number;
  goals: Goal[];
}

export interface PublicProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  challenges: ProfileChallengeParticipation[];
}

export interface DailyHistoryDay {
  date: string;
  completedGoalsCount: number;
  dayCompleted: boolean;
  streakAfter: number | null;
  records: (RecordEntry & { recordDate: string })[];
}

export interface KindAggregate {
  kind: GoalKind;
  recordsCount: number;
  sum?: number;
  average?: number;
  min?: number;
  max?: number;
  completedCount?: number;
}

export interface GoalAnalytics extends Goal {
  recordsCount: number;
  byKind: KindAggregate[];
}

export interface TodayState {
  daily: RecordEntry[];
  weekly: RecordEntry[];
  monthly: RecordEntry[];
  challenge: RecordEntry[];
}
