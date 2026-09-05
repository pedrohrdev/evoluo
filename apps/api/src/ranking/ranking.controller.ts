import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RankingService } from './ranking.service';

// Ranking é público para leitura, como perfis/metas/pontos/streak
// (CLAUDE.md seção 2 "Perfis") — nenhum endpoint de escrita: a posição só
// muda como efeito colateral de streak/pontos sendo atualizados alhures.
@UseGuards(SupabaseAuthGuard)
@Controller('challenges')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get(':challengeId/ranking')
  getRanking(@Param('challengeId', ParseUUIDPipe) challengeId: string) {
    return this.rankingService.getRanking(challengeId);
  }
}
