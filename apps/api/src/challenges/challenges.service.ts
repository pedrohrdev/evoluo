import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { JoinChallengeDto } from './dto/join-challenge.dto';

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  // Criar um desafio já inclui o criador como participante ativo, na mesma
  // transação — decisão confirmada com o usuário: o criador não precisa
  // entrar de novo pelo próprio join_code para participar do desafio dele.
  async create(userId: string, dto: CreateChallengeDto) {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.create({
        data: {
          name: dto.name,
          description: dto.description,
          durationDays: dto.durationDays,
          startDate: new Date(dto.startDate),
          createdBy: userId,
        },
      });

      await tx.challengeParticipant.create({
        data: {
          challengeId: challenge.id,
          userId,
        },
      });

      return challenge;
    });
  }

  async findById(id: string) {
    const challenge = await this.prisma.challenge.findUnique({ where: { id } });

    if (!challenge) {
      throw new NotFoundException('Desafio não encontrado.');
    }

    return challenge;
  }

  // Basta ter o join_code para entrar — sem aprovação do criador (CLAUDE.md
  // seção 2, "Outras regras já confirmadas").
  async join(userId: string, dto: JoinChallengeDto) {
    const joinCode = dto.joinCode.trim().toUpperCase();

    const challenge = await this.prisma.challenge.findUnique({ where: { joinCode } });

    if (!challenge) {
      throw new NotFoundException('Nenhum desafio encontrado para este código.');
    }

    const existing = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId: challenge.id, userId } },
    });

    if (existing) {
      throw new ConflictException('Você já participa deste desafio.');
    }

    try {
      return await this.prisma.challengeParticipant.create({
        data: { challengeId: challenge.id, userId },
      });
    } catch (error) {
      // Corrida entre duas entradas simultâneas: a constraint única
      // (challenge_id, user_id) protege mesmo se a checagem acima passou.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Você já participa deste desafio.');
      }
      throw error;
    }
  }

  // Hard-delete total, confirmado com o usuário: só o criador pode apagar,
  // e a exclusão cascateia para TODOS os participantes (challenge_participants
  // e tudo que pendura nela — goals, records, day_results, points_ledger —
  // via "on delete cascade"), não só para o próprio criador. Diferente de
  // "sair do desafio" (que só marca o vínculo como inativo e preserva tudo):
  // aqui o desafio deixa de existir de vez, inclusive no perfil público de
  // quem participou.
  //
  // goal_versions normalmente nunca pode ser apagado (histórico imutável,
  // trg_prevent_goal_version_delete) — a flag local abaixo é a única forma
  // de destravar esse delete em cascata, e só existe aqui, depois que já
  // validamos que quem pediu é o dono. Ver
  // supabase/migrations/20260911090000_delete_challenge.sql.
  async remove(challengeId: string, userId: string): Promise<void> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, createdBy: true },
    });

    if (!challenge) {
      throw new NotFoundException('Desafio não encontrado.');
    }

    if (challenge.createdBy !== userId) {
      throw new ForbiddenException('Só quem criou o desafio pode deletá-lo.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.bypass_goal_version_immutability', 'on', true)`;
      await tx.challenge.delete({ where: { id: challengeId } });
    });
  }
}
