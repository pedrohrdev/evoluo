import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AnalyticsService } from './analytics.service';

// Analytics é público para leitura, como perfis/metas/pontos/streak/
// histórico (CLAUDE.md seção 2 "Perfis") — sem endpoint de escrita: os
// valores agregados vêm sempre dos registros já existentes.
@UseGuards(SupabaseAuthGuard)
@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('challenge-participants/:participantId/analytics')
  getParticipantAnalytics(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.analyticsService.getParticipantAnalytics(participantId);
  }
}
