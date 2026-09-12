import { Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus, SpecialGoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FeedEventType = 'day_completed' | 'day_missed' | 'special_goal_created' | 'special_goal_resolved';

export interface FeedEvent {
  type: FeedEventType;
  at: Date;
  actorUserId: string;
  actorName: string;
  /** Preenchido só em eventos que envolvem duas pessoas (metas especiais). */
  targetName?: string;
  streak?: number;
  title?: string;
  status?: SpecialGoalStatus;
}

const DEFAULT_LIMIT = 30;

/**
 * Feed de atividade do desafio.
 *
 * Entre um check-in e o próximo, o produto ficava inerte por 24h: os amigos
 * registravam metas, o ranking mudava, e nada disso aparecia para ninguém.
 * Este módulo não cria nenhum dado novo — só lê o que já existe
 * (`day_results`, `special_goals`) e ordena por tempo.
 *
 * Deliberadamente sem tabela própria: um feed materializado exigiria manter
 * escrita em duas fontes e reprocessar histórico. Enquanto o volume for de
 * um desafio entre amigos, agregar na leitura é mais simples e nunca
 * dessincroniza.
 */
@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getChallengeFeed(challengeId: string, limit = DEFAULT_LIMIT): Promise<FeedEvent[]> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true },
    });

    if (!challenge) {
      throw new NotFoundException('Desafio não encontrado.');
    }

    const participants = await this.prisma.challengeParticipant.findMany({
      where: { challengeId, status: ParticipantStatus.active },
      select: { id: true, userId: true },
    });

    if (participants.length === 0) {
      return [];
    }

    const participantIds = participants.map((participant) => participant.id);
    const userIdByParticipant = new Map(participants.map((p) => [p.id, p.userId]));

    const profiles = await this.prisma.profile.findMany({
      where: { id: { in: participants.map((p) => p.userId) } },
      select: { id: true, displayName: true },
    });
    const nameByUser = new Map(profiles.map((p) => [p.id, p.displayName]));
    const nameOf = (participantId: string) =>
      nameByUser.get(userIdByParticipant.get(participantId) ?? '') ?? 'Participante';

    // Só dias já FECHADOS: um dia em andamento ainda pode mudar, e anunciar
    // "fulano fechou 3/3" antes do check-in seria mentira.
    const [dayResults, specialGoals] = await Promise.all([
      this.prisma.dayResult.findMany({
        where: { challengeParticipantId: { in: participantIds }, closed: true },
        orderBy: { resultDate: 'desc' },
        take: limit,
        select: {
          challengeParticipantId: true,
          resultDate: true,
          dayCompleted: true,
          streakAfter: true,
          updatedAt: true,
        },
      }),
      this.prisma.specialGoal.findMany({
        where: { challengeId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          fromParticipantId: true,
          toParticipantId: true,
          title: true,
          status: true,
          createdAt: true,
          completedAt: true,
          cancelledAt: true,
          declinedAt: true,
        },
      }),
    ]);

    const events: FeedEvent[] = [];

    for (const day of dayResults) {
      const actorUserId = userIdByParticipant.get(day.challengeParticipantId) ?? '';
      events.push({
        type: day.dayCompleted ? 'day_completed' : 'day_missed',
        at: day.updatedAt,
        actorUserId,
        actorName: nameOf(day.challengeParticipantId),
        streak: day.streakAfter ?? 0,
      });
    }

    for (const goal of specialGoals) {
      events.push({
        type: 'special_goal_created',
        at: goal.createdAt,
        actorUserId: userIdByParticipant.get(goal.fromParticipantId) ?? '',
        actorName: nameOf(goal.fromParticipantId),
        targetName: nameOf(goal.toParticipantId),
        title: goal.title,
        status: SpecialGoalStatus.pending,
      });

      // Uma meta resolvida rende DOIS eventos: quando foi criada e quando
      // foi resolvida — são momentos distintos da conversa entre os dois.
      const resolvedAt = goal.completedAt ?? goal.declinedAt ?? goal.cancelledAt;
      if (goal.status !== SpecialGoalStatus.pending && resolvedAt) {
        const resolvedByCreator = goal.status === SpecialGoalStatus.cancelled;
        const actorId = resolvedByCreator ? goal.fromParticipantId : goal.toParticipantId;
        events.push({
          type: 'special_goal_resolved',
          at: resolvedAt,
          actorUserId: userIdByParticipant.get(actorId) ?? '',
          actorName: nameOf(actorId),
          targetName: nameOf(resolvedByCreator ? goal.toParticipantId : goal.fromParticipantId),
          title: goal.title,
          status: goal.status,
        });
      }
    }

    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  }
}
