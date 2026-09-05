import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { StreakService } from './streak.service';

// Streak é público para leitura, como perfis/metas/pontos (CLAUDE.md
// seção 2 "Perfis") — nenhum endpoint de escrita: o streak só muda via
// close_daily_period() no banco.
@UseGuards(SupabaseAuthGuard)
@Controller()
export class StreakController {
  constructor(private readonly streakService: StreakService) {}

  @Get('challenge-participants/:participantId/streak')
  getStreak(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.streakService.getStreak(participantId);
  }
}
