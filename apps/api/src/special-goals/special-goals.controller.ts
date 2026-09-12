import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateSpecialGoalDto } from './dto/create-special-goal.dto';
import { SpecialGoalsService } from './special-goals.service';

// Metas especiais são públicas dentro do desafio, como as demais metas
// (CLAUDE.md seção 2 "Perfis") — só criar/concluir/cancelar é restrito.
@UseGuards(SupabaseAuthGuard)
@Controller()
export class SpecialGoalsController {
  constructor(private readonly specialGoalsService: SpecialGoalsService) {}

  @Post('challenges/:challengeId/special-goals')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId', ParseUUIDPipe) challengeId: string,
    @Body() dto: CreateSpecialGoalDto,
  ) {
    return this.specialGoalsService.create(challengeId, user.id, dto);
  }

  @Get('challenges/:challengeId/special-goals')
  findAll(@Param('challengeId', ParseUUIDPipe) challengeId: string) {
    return this.specialGoalsService.findAllForChallenge(challengeId);
  }

  @Patch('special-goals/:id/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.specialGoalsService.complete(id, user.id);
  }

  @Patch('special-goals/:id/decline')
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.specialGoalsService.decline(id, user.id);
  }

  // Contador para o badge na navegação — o que torna a funcionalidade
  // descobrível sem carregar a lista inteira.
  @Get('challenge-participants/:participantId/special-goals/pending-count')
  countPending(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.specialGoalsService.countPendingFor(participantId);
  }

  @Patch('special-goals/:id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.specialGoalsService.cancel(id, user.id);
  }
}
