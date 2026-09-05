import { NotFoundException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from './ranking.service';

describe('RankingService', () => {
  let challengeFindUnique: jest.Mock;
  let participantFindMany: jest.Mock;
  let prisma: PrismaService;
  let service: RankingService;

  beforeEach(() => {
    challengeFindUnique = jest.fn();
    participantFindMany = jest.fn();

    prisma = {
      challenge: { findUnique: challengeFindUnique },
      challengeParticipant: { findMany: participantFindMany },
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
      { position: 1, participantId: 'p1', userId: 'u1', currentStreak: 10, totalPoints: 300, totalDaysCompleted: 10 },
      { position: 2, participantId: 'p2', userId: 'u2', currentStreak: 5, totalPoints: 500, totalDaysCompleted: 5 },
    ]);
  });

  it('throws NotFoundException when the challenge does not exist', async () => {
    challengeFindUnique.mockResolvedValue(null);

    await expect(service.getRanking('missing')).rejects.toThrow(NotFoundException);
    expect(participantFindMany).not.toHaveBeenCalled();
  });
});
