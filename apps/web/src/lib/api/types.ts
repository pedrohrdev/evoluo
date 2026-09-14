// Tipos espelhando exatamente os DTOs/entidades já implementados no
// backend (apps/api) — nenhuma regra nova, só a forma dos dados.

export type GoalPeriod = "daily" | "weekly" | "monthly" | "challenge";
export type GoalKind = "hours" | "quantity" | "boolean";
export type Importance = "low" | "medium" | "high";
export type ParticipantStatus = "active" | "inactive";
// `declined`: o alvo pode recusar, não só cumprir (etapa 26).
export type SpecialGoalStatus = "pending" | "completed" | "cancelled" | "declined";

// Sem joinCode de propósito: o código é o único controle de acesso de
// entrada no desafio e o id do desafio é público (aparece no perfil de
// qualquer participante), então GET /challenges/:id não o devolve mais.
// Quem participa busca em GET /challenges/:id/join-code.
export interface Challenge {
  id: string;
  name: string;
  description: string | null;
  durationDays: 30 | 50 | 100 | 365;
  startDate: string;
  endDate: string;
  createdBy: string;
  createdAt: string;
}

// O que um convite mostra antes de a pessoa entrar (ou até se cadastrar).
// Sem o id do desafio e sem a lista de participantes de propósito.
export interface ChallengePreview {
  name: string;
  description: string | null;
  durationDays: number;
  startDate: string;
  endDate: string;
  participantCount: number;
}

export interface ChallengeJoinCode {
  challengeId: string;
  joinCode: string;
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
  // Vêm junto na resposta do ranking desde a etapa 23 — antes cada linha
  // buscava o perfil inteiro do usuário só para mostrar uma inicial.
  displayName: string | null;
  avatarUrl: string | null;
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
  // Data (sem hora) do check-in diário mais recente, ou null se nunca fez
  // nenhum. Usado só pra escolher qual desafio mostrar de cara quando a
  // pessoa está em mais de um — o mais recentemente ativo.
  lastCheckInDate: string | null;
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

// Painel do desafio padrão (pickDefaultChallenge) embutido no bootstrap do
// próprio perfil — evita que o dashboard precise de uma 2ª ida-e-volta
// sequencial só pra buscar isso depois de já saber qual desafio mostrar.
export interface DefaultChallengeDashboard {
  challengeId: string;
  participantId: string;
  today: TodayState;
  streak: ParticipantStreak;
  ranking: RankingEntry[];
}

export interface OwnDashboard extends PublicProfile {
  defaultChallenge: DefaultChallengeDashboard | null;
}

export interface DailyHistoryDay {
  date: string;
  completedGoalsCount: number;
  dayCompleted: boolean;
  streakAfter: number | null;
  // `title` é o título da meta NO MOMENTO do registro (vem de
  // goal_versions pela goal_version_id), nunca o título atual — renomear a
  // meta não pode reescrever o histórico (CLAUDE.md seção "Histórico").
  records: (RecordEntry & { recordDate: string; title: string })[];
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

// Tarefa avulsa entre dois participantes do mesmo desafio — sempre
// sim/não, sem prazo, puramente social (nunca gera pontos nem afeta
// streak/ranking). Ver CLAUDE.md seção 2 "Outras regras já confirmadas".
export interface SpecialGoal {
  id: string;
  challengeId: string;
  fromParticipantId: string;
  toParticipantId: string;
  title: string;
  status: SpecialGoalStatus;
  completedAt: string | null;
  cancelledAt: string | null;
  declinedAt: string | null;
  createdAt: string;
}

export interface TodayState {
  daily: RecordEntry[];
  weekly: RecordEntry[];
  monthly: RecordEntry[];
  challenge: RecordEntry[];
}

// Evento do feed do desafio. Derivado de day_results e special_goals — não
// existe tabela de feed (ver FeedService no backend).
export type FeedEventType = "day_completed" | "day_missed" | "special_goal_created" | "special_goal_resolved";

export interface FeedEvent {
  type: FeedEventType;
  at: string;
  actorUserId: string;
  actorName: string;
  targetName?: string;
  streak?: number;
  title?: string;
  status?: SpecialGoalStatus;
}

export interface DaySeriesEntry {
  resultDate: string;
  completedGoalsCount: number;
  dayCompleted: boolean;
}

export interface DaySeries {
  startDate: string;
  endDate: string;
  days: DaySeriesEntry[];
}
