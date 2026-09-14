import { Injectable, NotFoundException } from '@nestjs/common';
import { todayInSaoPaulo } from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';

// Só exposição do que o banco já mantém (CLAUDE.md seção "Streak" /
// docs/IMPLEMENTATION_PLAN.md etapa 8) — nenhum streak é calculado aqui.
// Regra revisada (etapa 28): `currentStreak`/`longestStreak` mudam em
// tempo real, a cada registro diário (trigger reconcile_daily_period),
// não só quando close_daily_period() fecha um dia à noite — o resultado de
// "hoje" já reflete o valor aplicado, podendo inclusive cair de novo se uma
// correção derrubar o dia de 3/3 para menos.
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
      // equivalente a "0/3 até agora". `closed` sempre reflete se
      // close_daily_period() já trancou este dia à noite (nunca deveria ser
      // true para a data de hoje — o job só tranca depois que o dia vira
      // passado); `dayCompleted`/`completedGoalsCount`/`streakAfter` já são
      // o valor reativo aplicado agora, não uma prévia.
      today: todayResult,
    };
  }
}
