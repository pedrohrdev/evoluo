import { Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Só leitura dos campos agregados já mantidos por Participants/Streak/Scoring
// (CLAUDE.md seção "Ranking" / docs/IMPLEMENTATION_PLAN.md etapa 9) — nada é
// recalculado aqui. A ordem de critérios (streak atual → pontos totais →
// dias concluídos → participant_id) é exatamente a que o índice
// `challenge_participants(challenge_id, current_streak desc, total_points
// desc, total_days_completed desc) where status='active'` foi criado para
// suportar (docs/database-schema.md). `longest_streak` nunca aparece aqui:
// a especificação proíbe usá-lo como critério de ranking.
@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async getRanking(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true },
    });

    if (!challenge) {
      throw new NotFoundException('Desafio não encontrado.');
    }

    // Participantes inativos (que já saíram do desafio) somem do ranking
    // ativo, mas seu histórico/pontos/streak continuam intactos no perfil
    // (CLAUDE.md seção 2 "Outras regras já confirmadas").
    const participants = await this.prisma.challengeParticipant.findMany({
      where: { challengeId, status: ParticipantStatus.active },
      select: {
        id: true,
        userId: true,
        currentStreak: true,
        totalPoints: true,
        totalDaysCompleted: true,
      },
      orderBy: [
        { currentStreak: 'desc' },
        { totalPoints: 'desc' },
        { totalDaysCompleted: 'desc' },
        { id: 'asc' },
      ],
    });

    return participants.map((participant, index) => ({
      position: index + 1,
      participantId: participant.id,
      userId: participant.userId,
      currentStreak: participant.currentStreak,
      totalPoints: participant.totalPoints,
      totalDaysCompleted: participant.totalDaysCompleted,
    }));
  }
}
