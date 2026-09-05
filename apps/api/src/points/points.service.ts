import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Só exposição do que o banco já calcula (CLAUDE.md seção "Pontos" /
// docs/IMPLEMENTATION_PLAN.md etapa 7) — nenhum ponto é somado ou
// recalculado aqui. `total_points` em challenge_participants e as linhas
// de points_ledger são gravados exclusivamente pelas funções de
// fechamento (security definer), fora do alcance desta etapa.
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    return this.prisma.pointsConfig.findMany({
      orderBy: [{ periodType: 'asc' }, { importance: 'asc' }],
    });
  }

  async getParticipantPoints(participantId: string) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { id: participantId },
      select: { id: true, totalPoints: true },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }

    const ledger = await this.prisma.pointsLedger.findMany({
      where: { challengeParticipantId: participantId },
      orderBy: { awardedForDate: 'desc' },
    });

    return {
      participantId: participant.id,
      totalPoints: participant.totalPoints,
      ledger,
    };
  }
}
