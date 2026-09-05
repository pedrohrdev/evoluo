import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GoalVersionDto } from './dto/goal-version.dto';
import { GoalsService } from './goals.service';

// Metas são públicas para leitura, como perfis (CLAUDE.md seção 2
// "Perfis") — só criar/editar é restrito ao dono do challenge_participant.
@UseGuards(SupabaseAuthGuard)
@Controller()
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post('challenge-participants/:participantId/goals')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: CreateGoalDto,
  ) {
    return this.goalsService.create(participantId, user.id, dto);
  }

  @Get('challenge-participants/:participantId/goals')
  findAll(@Param('participantId', ParseUUIDPipe) participantId: string) {
    return this.goalsService.findAllForParticipant(participantId);
  }

  @Patch('goals/:goalId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: GoalVersionDto,
  ) {
    return this.goalsService.setVersion(goalId, user.id, dto);
  }
}
