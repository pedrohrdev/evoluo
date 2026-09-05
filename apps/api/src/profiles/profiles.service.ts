import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
  ) {}

  async findById(id: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado.');
    }

    return profile;
  }

  // Perfil público (CLAUDE.md seção 2 "Perfis" / IMPLEMENTATION_PLAN etapa
  // 10): metas, streak, pontos e estatísticas básicas de cada participação
  // do usuário, ativa ou não — sair de um desafio não apaga nada do perfil
  // (CLAUDE.md seção 2 "Outras regras já confirmadas"). Só os agregados já
  // mantidos por Goals/Streak/Scoring são expostos aqui; o histórico dia a
  // dia (registros individuais) fica para a etapa 11, para não a
  // antecipar.
  async getPublicProfile(id: string) {
    const profile = await this.findById(id);

    const participations = await this.prisma.challengeParticipant.findMany({
      where: { userId: id },
      include: {
        challenge: {
          select: { id: true, name: true, durationDays: true, startDate: true, endDate: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    // Uma única query para as metas de todas as participações (nunca uma
    // por desafio) — evita um N+1 quando o usuário está em vários desafios
    // (etapa 18 "Performance").
    const goalsByParticipant = await this.goalsService.findAllForParticipants(
      participations.map((participant) => participant.id),
    );

    const challenges = participations.map((participant) => ({
      challengeId: participant.challenge.id,
      challengeName: participant.challenge.name,
      durationDays: participant.challenge.durationDays,
      startDate: participant.challenge.startDate,
      endDate: participant.challenge.endDate,
      participantId: participant.id,
      status: participant.status,
      joinedAt: participant.joinedAt,
      leftAt: participant.leftAt,
      currentStreak: participant.currentStreak,
      longestStreak: participant.longestStreak,
      totalPoints: participant.totalPoints,
      totalDaysCompleted: participant.totalDaysCompleted,
      goals: goalsByParticipant.get(participant.id) ?? [],
    }));

    return { ...profile, challenges };
  }

  async updateOwn(id: string, dto: UpdateProfileDto) {
    await this.findById(id);

    return this.prisma.profile.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        updatedAt: new Date(),
      },
    });
  }
}
