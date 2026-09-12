import { Injectable, Logger } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { todayInSaoPaulo, toDateString } from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

export interface PendingReminder {
  userId: string;
  displayName: string;
  challengeName: string;
  challengeId: string;
  currentStreak: number;
  completedToday: number;
}

/**
 * Lembrete diário de check-in.
 *
 * O produto inteiro gira em torno de um gesto diário e não tinha NENHUM
 * mecanismo de retorno — nem e-mail, nem push, nem ícone na tela inicial.
 * Quem esquecia um dia perdia o streak inteiro, e nada avisava antes.
 *
 * A consulta é barata porque o dado já existe: quem não fez check-in hoje é
 * exatamente quem não tem `day_results.closed = true` para a data de hoje.
 *
 * O canal é Web Push, não e-mail: a primeira implementação (etapa 25) mandava
 * e-mail, e o usuário corrigiu — ninguém abre e-mail antes da meia-noite para
 * salvar um streak. Push chega como qualquer outra notificação do celular.
 *
 * Sem chaves VAPID configuradas o serviço registra quantos lembretes faria e
 * não falha, então a rota pode ir para produção antes das chaves existirem.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** Participantes ativos, em desafio em curso, sem check-in fechado hoje. */
  async findPending(): Promise<PendingReminder[]> {
    const today = todayInSaoPaulo();
    const todayDate = new Date(today);

    const participants = await this.prisma.challengeParticipant.findMany({
      where: {
        status: ParticipantStatus.active,
        challenge: { startDate: { lte: todayDate }, endDate: { gte: todayDate } },
        // Sem linha fechada para hoje = ainda não fez check-in. Uma linha
        // aberta (progresso tentativo) não conta como check-in feito.
        dayResults: { none: { resultDate: todayDate, closed: true } },
      },
      select: {
        userId: true,
        currentStreak: true,
        challengeId: true,
        challenge: { select: { name: true } },
        dayResults: {
          where: { resultDate: todayDate },
          select: { completedGoalsCount: true },
        },
      },
    });

    if (participants.length === 0) {
      return [];
    }

    const profiles = await this.prisma.profile.findMany({
      where: { id: { in: participants.map((p) => p.userId) } },
      select: { id: true, displayName: true },
    });
    const nameByUser = new Map(profiles.map((p) => [p.id, p.displayName]));

    // Só quem tem ao menos um dispositivo inscrito — não há para onde
    // mandar push de quem nunca deu permissão, e contá-lo como "pendente"
    // inflaria o relatório com destinos inexistentes.
    const subscribed = await this.push.filterSubscribed(participants.map((p) => p.userId));

    return participants.flatMap((participant) => {
      if (!subscribed.has(participant.userId)) return [];

      return [
        {
          userId: participant.userId,
          displayName: nameByUser.get(participant.userId) ?? 'você',
          challengeName: participant.challenge.name,
          challengeId: participant.challengeId,
          currentStreak: participant.currentStreak,
          completedToday: participant.dayResults[0]?.completedGoalsCount ?? 0,
        },
      ];
    });
  }

  /** Monta e despacha os lembretes. Devolve quantos dispositivos receberam. */
  async sendDailyReminders(): Promise<{ pending: number; sent: number; skipped: string | null }> {
    const pending = await this.findPending();

    if (!this.push.isConfigured()) {
      this.logger.warn(
        `${pending.length} lembrete(s) pendente(s), nenhum enviado: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas.`,
      );
      return { pending: pending.length, sent: 0, skipped: 'chaves VAPID ausentes' };
    }

    let sent = 0;
    for (const reminder of pending) {
      const { subject, body } = this.buildMessage(reminder);
      // sendToUser já isola falha por dispositivo e limpa inscrições mortas.
      sent += await this.push.sendToUser(reminder.userId, {
        title: subject,
        body,
        url: `/c/${reminder.challengeId}`,
      });
    }

    return { pending: pending.length, sent, skipped: null };
  }

  /** Texto do lembrete. Sempre com o dado concreto, nunca genérico. */
  buildMessage(reminder: PendingReminder): { subject: string; body: string } {
    const remaining = Math.max(0, 3 - reminder.completedToday);

    const subject =
      reminder.currentStreak > 0
        ? `Seu streak de ${reminder.currentStreak} ${reminder.currentStreak === 1 ? 'dia' : 'dias'} acaba à meia-noite`
        : 'Você ainda não fez o check-in de hoje';

    // Concordância de verbo junto com a de número: "Falta 1 meta", nunca
    // "Faltam 1 meta".
    const missing = remaining === 1 ? 'Falta 1 meta' : `Faltam ${remaining} metas`;
    const streakDays = `${reminder.currentStreak} ${reminder.currentStreak === 1 ? 'dia' : 'dias'}`;

    const line =
      reminder.currentStreak > 0
        ? `${missing} para manter seus ${streakDays} de streak em ${reminder.challengeName}.`
        : `${missing} para fechar o dia em ${reminder.challengeName}.`;

    // Corpo curto: numa notificação o sistema trunca, e a informação que
    // importa (quanto falta e o que está em jogo) tem que caber na primeira
    // linha. Nada de saudação nem assinatura, que era formato de e-mail.
    return { subject, body: line };
  }

  /** Exposto para o endpoint conferir a data usada, sem recalcular fuso. */
  todayLabel(): string {
    return toDateString(new Date(todayInSaoPaulo()));
  }
}
