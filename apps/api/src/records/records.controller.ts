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

  // PUT (não POST): registrar o valor de hoje é um upsert idempotente — a
  // mesma requisição reenviada no mesmo dia substitui o valor, nunca
  // duplica pontos. Não existe parâmetro de data: é sempre "hoje".
  @Put('goals/:goalId/daily-record')
  recordToday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: RecordDailyGoalDto,
  ) {
    return this.recordsService.recordToday(goalId, user.id, dto);
  }

  // Mesmo padrão de recordToday, para o período semanal vigente (segunda a
  // domingo). Também sem parâmetro de período: é sempre o que contém hoje.
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

  // Estado do período ainda aberto (hoje/semana/mês/duração) — usado pelo
  // frontend (etapa 15) para restaurar o que já foi registrado ao
  // recarregar a página, já que o histórico (acima) só cobre períodos
  // fechados.
  @Get('challenge-participants/:participantId/today')
  getTodayState(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.recordsService.getTodayState(participantId);
  }
}
