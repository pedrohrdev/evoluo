import { NotFoundException } from '@nestjs/common';
import { ParticipantStatus, SpecialGoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeedService } from './feed.service';

describe('FeedService', () => {
  let challengeFindUnique: jest.Mock;
  let participantFindMany: jest.Mock;
  let profileFindMany: jest.Mock;
  let dayResultFindMany: jest.Mock;
  let specialGoalFindMany: jest.Mock;
  let service: FeedService;

  beforeEach(() => {
    challengeFindUnique = jest.fn().mockResolvedValue({ id: 'c1' });
    participantFindMany = jest.fn().mockResolvedValue([
      { id: 'p1', userId: 'u1' },
      { id: 'p2', userId: 'u2' },
    ]);
    profileFindMany = jest.fn().mockResolvedValue([
      { id: 'u1', displayName: 'Ana' },
      { id: 'u2', displayName: 'Bruno' },
    ]);
    dayResultFindMany = jest.fn().mockResolvedValue([]);
    specialGoalFindMany = jest.fn().mockResolvedValue([]);

    service = new FeedService({
      challenge: { findUnique: challengeFindUnique },
      challengeParticipant: { findMany: participantFindMany },
      profile: { findMany: profileFindMany },
      dayResult: { findMany: dayResultFindMany },
      specialGoal: { findMany: specialGoalFindMany },
    } as unknown as PrismaService);
  });

  it('throws NotFoundException when the challenge does not exist', async () => {
    challengeFindUnique.mockResolvedValue(null);

    await expect(service.getChallengeFeed('c1')).rejects.toThrow(NotFoundException);
  });

  it('returns nothing, and touches nothing else, when the challenge has no active participants', async () => {
    participantFindMany.mockResolvedValue([]);

    await expect(service.getChallengeFeed('c1')).resolves.toEqual([]);
    expect(dayResultFindMany).not.toHaveBeenCalled();
  });

  // Um dia em andamento ainda pode mudar — anunciar "fulano fechou 3/3"
  // antes do check-in seria mentira.
  it('reads only closed days', async () => {
    await service.getChallengeFeed('c1');

    expect(dayResultFindMany.mock.calls[0][0].where).toMatchObject({ closed: true });
    expect(participantFindMany.mock.calls[0][0].where).toMatchObject({ status: ParticipantStatus.active });
  });

  it('turns a closed day into a completed or missed event, named after the participant', async () => {
    dayResultFindMany.mockResolvedValue([
      {
        challengeParticipantId: 'p1',
        resultDate: new Date('2026-09-10'),
        dayCompleted: true,
        streakAfter: 7,
        updatedAt: new Date('2026-09-10T23:00:00Z'),
      },
      {
        challengeParticipantId: 'p2',
        resultDate: new Date('2026-09-10'),
        dayCompleted: false,
        streakAfter: 0,
        updatedAt: new Date('2026-09-10T22:00:00Z'),
      },
    ]);

    const feed = await service.getChallengeFeed('c1');

    expect(feed).toMatchObject([
      { type: 'day_completed', actorName: 'Ana', streak: 7 },
      { type: 'day_missed', actorName: 'Bruno', streak: 0 },
    ]);
  });

  // Criar e resolver são momentos distintos da conversa entre os dois.
  it('emits two events for a resolved special goal', async () => {
    specialGoalFindMany.mockResolvedValue([
      {
        fromParticipantId: 'p1',
        toParticipantId: 'p2',
        title: 'Postar uma foto do treino',
        status: SpecialGoalStatus.completed,
        createdAt: new Date('2026-09-09T10:00:00Z'),
        completedAt: new Date('2026-09-10T10:00:00Z'),
        cancelledAt: null,
        declinedAt: null,
      },
    ]);

    const feed = await service.getChallengeFeed('c1');

    expect(feed).toMatchObject([
      // Mais recente primeiro: a resolução vem antes da criação.
      { type: 'special_goal_resolved', actorName: 'Bruno', targetName: 'Ana', status: SpecialGoalStatus.completed },
      { type: 'special_goal_created', actorName: 'Ana', targetName: 'Bruno' },
    ]);
  });

  // Cancelar é do criador; cumprir e recusar são do alvo — o ator do evento
  // muda de lado conforme o status.
  it('credits a cancellation to the creator, not the target', async () => {
    specialGoalFindMany.mockResolvedValue([
      {
        fromParticipantId: 'p1',
        toParticipantId: 'p2',
        title: 'Desistiu dessa',
        status: SpecialGoalStatus.cancelled,
        createdAt: new Date('2026-09-09T10:00:00Z'),
        completedAt: null,
        cancelledAt: new Date('2026-09-10T10:00:00Z'),
        declinedAt: null,
      },
    ]);

    const feed = await service.getChallengeFeed('c1');

    expect(feed[0]).toMatchObject({ type: 'special_goal_resolved', actorName: 'Ana', targetName: 'Bruno' });
  });

  it('sorts every source together, most recent first, and respects the limit', async () => {
    dayResultFindMany.mockResolvedValue([
      {
        challengeParticipantId: 'p1',
        resultDate: new Date('2026-09-08'),
        dayCompleted: true,
        streakAfter: 1,
        updatedAt: new Date('2026-09-08T23:00:00Z'),
      },
    ]);
    specialGoalFindMany.mockResolvedValue([
      {
        fromParticipantId: 'p2',
        toParticipantId: 'p1',
        title: 'mais nova',
        status: SpecialGoalStatus.pending,
        createdAt: new Date('2026-09-11T10:00:00Z'),
        completedAt: null,
        cancelledAt: null,
        declinedAt: null,
      },
    ]);

    const feed = await service.getChallengeFeed('c1', 1);

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ type: 'special_goal_created', title: 'mais nova' });
  });

  it('falls back to a neutral name when a profile row is missing', async () => {
    profileFindMany.mockResolvedValue([]);
    dayResultFindMany.mockResolvedValue([
      {
        challengeParticipantId: 'p1',
        resultDate: new Date('2026-09-10'),
        dayCompleted: true,
        streakAfter: 3,
        updatedAt: new Date('2026-09-10T23:00:00Z'),
      },
    ]);

    const feed = await service.getChallengeFeed('c1');

    expect(feed[0].actorName).toBe('Participante');
  });
});
