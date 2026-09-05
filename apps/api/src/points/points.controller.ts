import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { PointsService } from './points.service';

// Pontos são públicos para leitura, como perfis e metas (CLAUDE.md seção 2
// "Perfis") — nenhum endpoint de escrita aqui, os pontos só existem como
// resultado do fechamento de período (etapa 8+).
@UseGuards(SupabaseAuthGuard)
@Controller()
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('points-config')
  getConfig() {
    return this.pointsService.getConfig();
  }

  @Get('challenge-participants/:participantId/points')
  getParticipantPoints(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.pointsService.getParticipantPoints(participantId);
  }
}
