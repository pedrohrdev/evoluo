import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ChallengesService } from './challenges.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { JoinChallengeDto } from './dto/join-challenge.dto';

// Desafios são públicos para leitura (CLAUDE.md seção 2 / arquitetura seção
// 6) — por isso GET :id não checa dono, só exige estar autenticado.
@UseGuards(SupabaseAuthGuard)
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChallengeDto) {
    return this.challengesService.create(user.id, dto);
  }

  @Post('join')
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinChallengeDto) {
    return this.challengesService.join(user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.challengesService.findById(id);
  }
}
