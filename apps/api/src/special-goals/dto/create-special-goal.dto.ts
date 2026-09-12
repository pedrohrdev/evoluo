import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSpecialGoalDto {
  @IsUUID()
  toParticipantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}
