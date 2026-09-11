import { Type } from 'class-transformer';
import { IsArray, IsUUID, ValidateNested } from 'class-validator';
import { RecordDailyGoalDto } from './record-daily-goal.dto';

// Uma entrada do check-in: qual meta diária, e o valor realizado (mesma
// forma de RecordDailyGoalDto — a checagem cruzada com o `kind` da versão
// vigente continua em RecordsService.assertActualMatchesKind).
export class CheckInDailyEntryDto extends RecordDailyGoalDto {
  @IsUUID()
  goalId!: string;
}

// Corpo do check-in diário único (CLAUDE.md seção "Streak"): o participante
// envia de uma vez o que preencheu das metas diárias — metas deixadas de
// fora do array simplesmente não são registradas (0/3 automático já é uma
// regra existente), não é erro. Pode chegar vazio (ex.: participante abriu
// o check-in só para atualizar uma meta semanal/mensal/de duração, sem
// preencher nenhuma diária) — o check-in ainda assim fecha o dia de hoje.
export class CheckInDailyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckInDailyEntryDto)
  records!: CheckInDailyEntryDto[];
}
