import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RecordDailyGoalDto } from './dto/record-daily-goal.dto';
import { RecordPeriodGoalDto } from './dto/record-period-goal.dto';
import { RecordsService } from './records.service';

@UseGuards(SupabaseAuthGuard)
@Controller()
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  // Upsert idempotente por goalId, sempre para HOJE — mesmo padrão de
  // recordCurrentWeek/Month/Challenge abaixo. Regra revisada com o usuário:
  // não existe mais "check-in único por dia"; cada meta diária pode ser
  // registrada e corrigida quantas vezes quiser ao longo do dia. Streak e
  // pontos reagem em tempo real (trigger reconcile_daily_period, ver
  // supabase/migrations/20260914090000).
  @Put('goals/:goalId/daily-record')
  recordCurrentDaily(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: RecordDailyGoalDto,
  ) {
    return this.recordsService.recordCurrentDaily(goalId, user.id, dto);
  }

  // Metas semanais/mensais/de duração seguem o mesmo padrão — upsert
  // idempotente por goalId, livre até o fim do próprio período. Também sem
  // parâmetro de período: é sempre o que contém hoje.
  @Put('goals/:goalId/weekly-record')
  recordCurrentWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: RecordPeriodGoalDto,
  ) {
    return this.recordsService.recordCurrentWeek(goalId, user.id, dto);
  }

  // Mesmo padrão, para o período mensal vigente (dia 1 ao último dia do mês).
  @Put('goals/:goalId/monthly-record')
  recordCurrentMonth(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: RecordPeriodGoalDto,
  ) {
    return this.recordsService.recordCurrentMonth(goalId, user.id, dto);
  }

  // Mesmo padrão, para o período de duração do desafio — fixo (data de
  // entrada do participante até o fim do desafio), não "o vigente agora".
  @Put('goals/:goalId/challenge-record')
  recordCurrentChallenge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: RecordPeriodGoalDto,
  ) {
    return this.recordsService.recordCurrentChallenge(goalId, user.id, dto);
  }

  // Histórico é público para leitura, como perfis/metas/pontos/streak
  // (CLAUDE.md seção 2 "Perfis").
  @Get('challenge-participants/:participantId/daily-history')
  getHistory(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.recordsService.getHistory(participantId);
  }

  // Série compacta para o heatmap do ano (uma célula por dia fechado).
  @Get('challenge-participants/:participantId/day-series')
  getDaySeries(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.recordsService.getDaySeries(participantId);
  }

  // Estado do período ainda aberto (hoje/semana/mês/duração) — usado pelo
  // frontend (etapa 15) para restaurar o que já foi registrado ao
  // recarregar a página, já que o histórico (acima) só cobre períodos
  // fechados.
  @Get('challenge-participants/:participantId/today')
  getTodayState(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.recordsService.getTodayState(participantId);
  }
}
