import { GoalKind, ImportanceLevel } from '@prisma/client';
import { IsEnum, IsNumber, IsPositive, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

// Campos de conteúdo de uma versão de meta — usados tanto para criar a
// primeira versão (CreateGoalDto estende esta classe) quanto para editar
// uma meta existente (nova versão via GoalsService.setVersion()).
export class GoalVersionDto {
  @IsEnum(GoalKind)
  kind!: GoalKind;

  @IsEnum(ImportanceLevel)
  importance!: ImportanceLevel;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  // Obrigatório e positivo para horas/quantidade; para sim/não não deve ser
  // enviado (chk_target_value_matches_kind no banco) — a checagem "não deve
  // ser enviado quando boolean" fica no GoalsService, não aqui, porque
  // class-validator não combina bem duas condições opostas na mesma
  // propriedade.
  @ValidateIf((dto: GoalVersionDto) => dto.kind !== GoalKind.boolean)
  @IsNumber()
  @IsPositive()
  targetValue?: number;
}
