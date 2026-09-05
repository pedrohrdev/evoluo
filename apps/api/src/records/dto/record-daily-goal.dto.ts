import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

// Qual campo é obrigatório (actualValue x actualBoolean) depende do `kind`
// da versão vigente da meta, que só é conhecido no service — por isso a
// checagem cruzada fica em RecordsService.assertActualMatchesKind, não
// aqui (mesmo padrão de GoalVersionDto).
export class RecordDailyGoalDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualValue?: number;

  @IsOptional()
  @IsBoolean()
  actualBoolean?: boolean;
}
