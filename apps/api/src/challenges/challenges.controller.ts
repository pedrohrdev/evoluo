import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

  // Limite mais restrito que o padrão global (etapa 19 "Segurança e regras
  // anti-exploit"): o código já é não sequencial e de espaço de busca
  // grande (32^8 combinações — supabase/migrations/20260905090300_challenges.sql),
  // mas é o único controle de acesso de entrada em desafio, então vale a
  // camada extra contra tentativa automatizada de adivinhação.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('join')
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinChallengeDto) {
    return this.challengesService.join(user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.challengesService.findById(id);
  }
}
