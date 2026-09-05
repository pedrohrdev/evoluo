import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Duração fixa em dias, conforme CLAUDE.md seção 1 e o check constraint de
// `challenges.duration_days` (supabase/migrations/20260905090300_challenges.sql).
export const CHALLENGE_DURATIONS = [30, 50, 100, 365] as const;
export type ChallengeDuration = (typeof CHALLENGE_DURATIONS)[number];

export class CreateChallengeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @IsIn(CHALLENGE_DURATIONS)
  durationDays!: ChallengeDuration;

  @IsDateString()
  startDate!: string;
}
