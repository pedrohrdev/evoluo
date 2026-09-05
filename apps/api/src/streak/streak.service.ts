import { Injectable, NotFoundException } from '@nestjs/common';
import { todayInSaoPaulo } from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';

// Só exposição do que o banco já mantém (CLAUDE.md seção "Streak" /
// docs/IMPLEMENTATION_PLAN.md etapa 8) — nenhum streak é calculado aqui.
// `currentStreak`/`longestStreak` só mudam quando close_daily_period()
// fecha um dia; o resultado de "hoje" é sempre o estado tentativo mantido
// por upsert_day_result() em tempo real, nunca a decisão definitiva.
@Injectable()
export class StreakService {
  constructor(private readonly prisma: PrismaService) {}

  async getStreak(participantId: string) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { id: participantId },
      select: { id: true, currentStreak: true, longestStreak: true },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }

    const today = new Date(todayInSaoPaulo());

    const todayResult = await this.prisma.dayResult.findUnique({
      where: {
        challengeParticipantId_resultDate: {
          challengeParticipantId: participantId,
          resultDate: today,
        },
      },
    });

    return {
      participantId: participant.id,
      currentStreak: participant.currentStreak,
      longestStreak: participant.longestStreak,
      // null quando o participante ainda não lançou nenhum registro hoje —
      // equivalente a "0/3 até agora, ainda não fechado". `closed` sempre
      // reflete se close_daily_period() já decidiu este dia (nunca deveria
      // ser true para a data de hoje, já que o fechamento só roda depois
      // que o dia vira passado).
      today: todayResult,
    };
  }
}
