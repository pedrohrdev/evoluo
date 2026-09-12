import { NotFoundException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from './ranking.service';

describe('RankingService', () => {
  let challengeFindUnique: jest.Mock;
  let participantFindMany: jest.Mock;
  let profileFindMany: jest.Mock;
  let prisma: PrismaService;
  let service: RankingService;

  beforeEach(() => {
    challengeFindUnique = jest.fn();
    participantFindMany = jest.fn();
    profileFindMany = jest.fn().mockResolvedValue([]);

    prisma = {
      challenge: { findUnique: challengeFindUnique },
      challengeParticipant: { findMany: participantFindMany },
      profile: { findMany: profileFindMany },
    } as unknown as PrismaService;

    service = new RankingService(prisma);
  });

  it('lists only active participants, ordered by streak, points, days completed then id, without recalculating anything', async () => {
    challengeFindUnique.mockResolvedValue({ id: 'c1' });
    const participants = [
      { id: 'p1', userId: 'u1', currentStreak: 10, totalPoints: 300, totalDaysCompleted: 10 },
      { id: 'p2', userId: 'u2', currentStreak: 5, totalPoints: 500, totalDaysCompleted: 5 },
    ];
    participantFindMany.mockResolvedValue(participants);

    const result = await service.getRanking('c1');

    expect(challengeFindUnique).toHaveBeenCalledWith({ where: { id: 'c1' }, select: { id: true } });
    expect(participantFindMany).toHaveBeenCalledWith({
      where: { challengeId: 'c1', status: ParticipantStatus.active },
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
    expect(result).toEqual([
      { position: 1, participantId: 'p1', userId: 'u1', displayName: null, avatarUrl: null, currentStreak: 10, totalPoints: 300, totalDaysCompleted: 10 },
      { position: 2, participantId: 'p2', userId: 'u2', displayName: null, avatarUrl: null, currentStreak: 5, totalPoints: 500, totalDaysCompleted: 5 },
    ]);
  });

  // Regressão da etapa 23: antes o ranking devolvia só o userId e cada linha
  // do frontend buscava GET /profiles/:id (o endpoint mais caro da API) para
  // desenhar uma inicial — e jogava fora o avatarUrl que acabara de buscar.
  it('resolves displayName and avatarUrl for the whole page in a single query', async () => {
    challengeFindUnique.mockResolvedValue({ id: 'c1' });
    participantFindMany.mockResolvedValue([
      { id: 'p1', userId: 'u1', currentStreak: 3, totalPoints: 90, totalDaysCompleted: 3 },
      { id: 'p2', userId: 'u2', currentStreak: 1, totalPoints: 30, totalDaysCompleted: 1 },
    ]);
    profileFindMany.mockResolvedValue([
      { id: 'u1', displayName: 'Ana', avatarUrl: 'https://cdn/a.png' },
      { id: 'u2', displayName: 'Bruno', avatarUrl: null },
    ]);

    const result = await service.getRanking('c1');

    expect(profileFindMany).toHaveBeenCalledTimes(1);
    expect(profileFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'u2'] } },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    expect(result[0]).toMatchObject({ displayName: 'Ana', avatarUrl: 'https://cdn/a.png' });
    expect(result[1]).toMatchObject({ displayName: 'Bruno', avatarUrl: null });
  });

  it('falls back to null when a participant has no profile row, without dropping the entry', async () => {
    challengeFindUnique.mockResolvedValue({ id: 'c1' });
    participantFindMany.mockResolvedValue([
      { id: 'p1', userId: 'u1', currentStreak: 0, totalPoints: 0, totalDaysCompleted: 0 },
    ]);
    profileFindMany.mockResolvedValue([]);

    const result = await service.getRanking('c1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ participantId: 'p1', displayName: null, avatarUrl: null });
  });

  it('throws NotFoundException when the challenge does not exist', async () => {
    challengeFindUnique.mockResolvedValue(null);

    await expect(service.getRanking('missing')).rejects.toThrow(NotFoundException);
    expect(participantFindMany).not.toHaveBeenCalled();
  });
});
