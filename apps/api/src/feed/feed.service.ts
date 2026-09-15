import { Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FeedEventType = 'day_completed' | 'day_missed';

export interface FeedEvent {
  type: FeedEventType;
  at: Date;
  actorUserId: string;
  actorName: string;
  streak?: number;
}

const DEFAULT_LIMIT = 30;

/**
 * Feed de atividade do desafio.
 *
 * Entre um check-in e o próximo, o produto ficava inerte por 24h: os amigos
 * registravam metas, o ranking mudava, e nada disso aparecia para ninguém.
 * Este módulo não cria nenhum dado novo — só lê o que já existe
 * (`day_results`) e ordena por tempo.
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
      select: { id: true, startDate: true },
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
    //
    // E só dias a partir de `start_date`, pelo mesmo motivo de
    // RecordsService.getHistory/getDaySeries: antes do início do desafio o
    // backend recusa qualquer check-in, então anunciar "fulano perdeu o
    // dia" numa data dessas é publicar uma derrota que era impossível. O
    // job noturno não cria mais day_results anteriores ao início
    // (migration 20260912090000), mas linhas gravadas antes dessa correção
    // continuam no banco — filtrar na leitura cobre as duas pontas.
    const dayResults = await this.prisma.dayResult.findMany({
      where: {
        challengeParticipantId: { in: participantIds },
        closed: true,
        resultDate: { gte: challenge.startDate },
      },
      orderBy: { resultDate: 'desc' },
      take: limit,
      select: {
        challengeParticipantId: true,
        resultDate: true,
        dayCompleted: true,
        streakAfter: true,
        updatedAt: true,
      },
    });

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

    return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
  }
}
