import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { FeedService } from './feed.service';

// Leitura pública dentro do app, como ranking/histórico/metas (CLAUDE.md
// seção 2 "Perfis") — o feed só reúne o que já era visível.
@UseGuards(SupabaseAuthGuard)
@Controller('challenges')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get(':challengeId/feed')
  getFeed(
    @Param('challengeId', ParseUUIDPipe) challengeId: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.feedService.getChallengeFeed(challengeId, Math.min(Math.max(limit, 1), 100));
  }
}
