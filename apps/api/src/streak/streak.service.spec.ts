import { NotFoundException } from '@nestjs/common';
import { todayInSaoPaulo } from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';
import { StreakService } from './streak.service';

describe('StreakService', () => {
  let participantFindUnique: jest.Mock;
  let dayResultFindUnique: jest.Mock;
  let prisma: PrismaService;
  let service: StreakService;

  beforeEach(() => {
    participantFindUnique = jest.fn();
    dayResultFindUnique = jest.fn();

    prisma = {
      challengeParticipant: { findUnique: participantFindUnique },
      dayResult: { findUnique: dayResultFindUnique },
    } as unknown as PrismaService;

    service = new StreakService(prisma);
  });

  it('returns the definitive streak fields plus the tentative state of today', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1', currentStreak: 5, longestStreak: 12 });
    const todayResult = { completedGoalsCount: 2, dayCompleted: false, closed: false };
    dayResultFindUnique.mockResolvedValue(todayResult);

    const result = await service.getStreak('p1');

    const today = new Date(todayInSaoPaulo());
    expect(participantFindUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: { id: true, currentStreak: true, longestStreak: true },
    });
    expect(dayResultFindUnique).toHaveBeenCalledWith({
      where: { challengeParticipantId_resultDate: { challengeParticipantId: 'p1', resultDate: today } },
    });
    expect(result).toEqual({
      participantId: 'p1',
      currentStreak: 5,
      longestStreak: 12,
      today: todayResult,
    });
  });

  it('returns today as null when nothing has been recorded yet today', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1', currentStreak: 0, longestStreak: 0 });
    dayResultFindUnique.mockResolvedValue(null);

    const result = await service.getStreak('p1');

    expect(result.today).toBeNull();
  });

  it('throws NotFoundException when the participant does not exist', async () => {
    participantFindUnique.mockResolvedValue(null);

    await expect(service.getStreak('missing')).rejects.toThrow(NotFoundException);
    expect(dayResultFindUnique).not.toHaveBeenCalled();
  });
});
