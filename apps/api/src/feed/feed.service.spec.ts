import { NotFoundException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeedService } from './feed.service';

describe('FeedService', () => {
  let challengeFindUnique: jest.Mock;
  let participantFindMany: jest.Mock;
  let profileFindMany: jest.Mock;
  let dayResultFindMany: jest.Mock;
  let service: FeedService;

  beforeEach(() => {
    challengeFindUnique = jest.fn().mockResolvedValue({ id: 'c1', startDate: new Date('2026-09-14') });
    participantFindMany = jest.fn().mockResolvedValue([
      { id: 'p1', userId: 'u1' },
      { id: 'p2', userId: 'u2' },
    ]);
    profileFindMany = jest.fn().mockResolvedValue([
      { id: 'u1', displayName: 'Ana' },
      { id: 'u2', displayName: 'Bruno' },
    ]);
    dayResultFindMany = jest.fn().mockResolvedValue([]);

    service = new FeedService({
      challenge: { findUnique: challengeFindUnique },
      challengeParticipant: { findMany: participantFindMany },
      profile: { findMany: profileFindMany },
      dayResult: { findMany: dayResultFindMany },
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

  // Antes do início do desafio o backend recusa qualquer check-in, então
  // um day_result nessa faixa (resquício do job noturno antigo, corrigido
  // na migration 20260912090000) não pode virar "fulano perdeu o dia" no
  // feed — é anunciar uma derrota que era impossível.
  it('reads only days from the challenge start date onwards', async () => {
    await service.getChallengeFeed('c1');

    expect(dayResultFindMany.mock.calls[0][0].where).toMatchObject({
      resultDate: { gte: new Date('2026-09-14') },
    });
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

  it('sorts by time, most recent first, and respects the limit', async () => {
    dayResultFindMany.mockResolvedValue([
      {
        challengeParticipantId: 'p1',
        resultDate: new Date('2026-09-08'),
        dayCompleted: true,
        streakAfter: 1,
        updatedAt: new Date('2026-09-08T23:00:00Z'),
      },
      {
        challengeParticipantId: 'p2',
        resultDate: new Date('2026-09-09'),
        dayCompleted: true,
        streakAfter: 2,
        updatedAt: new Date('2026-09-09T23:00:00Z'),
      },
    ]);

    const feed = await service.getChallengeFeed('c1', 1);

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ actorName: 'Bruno' });
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
