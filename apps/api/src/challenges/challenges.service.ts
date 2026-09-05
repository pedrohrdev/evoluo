import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
}
