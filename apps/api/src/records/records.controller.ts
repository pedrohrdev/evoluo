import { Body, Controller, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RecordDailyGoalDto } from './dto/record-daily-goal.dto';
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
}
