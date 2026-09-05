import { GoalPeriod } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { GoalVersionDto } from './goal-version.dto';

export class CreateGoalDto extends GoalVersionDto {
  @IsEnum(GoalPeriod)
  periodType!: GoalPeriod;
}
