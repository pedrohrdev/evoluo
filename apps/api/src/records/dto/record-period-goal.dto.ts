import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

// Mesmo formato de entrada da meta diária (RecordDailyGoalDto) — a
// checagem cruzada com o `kind` da versão vigente também fica no service
// (RecordsService.assertActualMatchesKind), não aqui.
export class RecordPeriodGoalDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualValue?: number;

  @IsOptional()
  @IsBoolean()
  actualBoolean?: boolean;
}
