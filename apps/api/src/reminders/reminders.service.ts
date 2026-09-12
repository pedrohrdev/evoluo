import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParticipantStatus } from '@prisma/client';
import { todayInSaoPaulo, toDateString } from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface PendingReminder {
  userId: string;
  email: string;
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
 * O envio é plugável de propósito. Sem `RESEND_API_KEY` configurada, o
 * serviço apenas registra quantos lembretes seriam enviados e não falha —
 * assim a rota pode ir para produção antes da credencial existir, e o dia em
 * que a chave for configurada nada mais precisa mudar.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly configService: ConfigService,
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

    // O e-mail vive em auth.users, que o Prisma não modela (é do Supabase
    // Auth) — por isso a busca passa pelo adminClient.
    const emailByUser = await this.fetchEmails(participants.map((p) => p.userId));

    return participants.flatMap((participant) => {
      const email = emailByUser.get(participant.userId);
      if (!email) return [];

      return [
        {
          userId: participant.userId,
          email,
          displayName: nameByUser.get(participant.userId) ?? 'você',
          challengeName: participant.challenge.name,
          challengeId: participant.challengeId,
          currentStreak: participant.currentStreak,
          completedToday: participant.dayResults[0]?.completedGoalsCount ?? 0,
        },
      ];
    });
  }

  /** Monta e despacha os lembretes. Devolve quantos foram enviados. */
  async sendDailyReminders(): Promise<{ pending: number; sent: number; skipped: string | null }> {
    const pending = await this.findPending();

    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('REMINDER_FROM_EMAIL');

    if (!apiKey || !from) {
      this.logger.warn(
        `${pending.length} lembrete(s) pendente(s), nenhum enviado: RESEND_API_KEY/REMINDER_FROM_EMAIL não configuradas.`,
      );
      return { pending: pending.length, sent: 0, skipped: 'credenciais de e-mail ausentes' };
    }

    let sent = 0;
    for (const reminder of pending) {
      try {
        await this.deliver(apiKey, from, reminder);
        sent += 1;
      } catch (error) {
        // Um e-mail que falha nunca derruba o lote inteiro.
        this.logger.error(`Falha ao enviar lembrete para ${reminder.userId}: ${String(error)}`);
      }
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

    return {
      subject,
      body: `Oi, ${reminder.displayName}.\n\n${line}\n\nO dia fecha à meia-noite (horário de Brasília).`,
    };
  }

  private async deliver(apiKey: string, from: string, reminder: PendingReminder): Promise<void> {
    const { subject, body } = this.buildMessage(reminder);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: reminder.email, subject, text: body }),
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
  }

  private async fetchEmails(userIds: string[]): Promise<Map<string, string>> {
    const unique = Array.from(new Set(userIds));
    const byUser = new Map<string, string>();

    // listUsers pagina; o volume esperado (participantes ativos sem
    // check-in num dia) cabe com folga em poucas páginas.
    let page = 1;
    for (;;) {
      const { data, error } = await this.supabase.adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;

      for (const user of data.users) {
        if (user.email && unique.includes(user.id)) {
          byUser.set(user.id, user.email);
        }
      }

      if (data.users.length < 1000 || byUser.size >= unique.length) break;
      page += 1;
    }

    return byUser;
  }

  /** Exposto para o endpoint conferir a data usada, sem recalcular fuso. */
  todayLabel(): string {
    return toDateString(new Date(todayInSaoPaulo()));
  }
}
