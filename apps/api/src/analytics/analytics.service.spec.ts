import { NotFoundException } from '@nestjs/common';
import { GoalKind, GoalPeriod } from '@prisma/client';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let participantFindUnique: jest.Mock;
  let dailyRecordFindMany: jest.Mock;
  let weeklyRecordFindMany: jest.Mock;
  let monthlyRecordFindMany: jest.Mock;
  let challengeRecordFindMany: jest.Mock;
  let findAllForParticipant: jest.Mock;
  let prisma: PrismaService;
  let goalsService: GoalsService;
  let service: AnalyticsService;

  const SELECT = { goalId: true, actualValue: true, actualBoolean: true, kind: true };

  beforeEach(() => {
    participantFindUnique = jest.fn();
    dailyRecordFindMany = jest.fn().mockResolvedValue([]);
    weeklyRecordFindMany = jest.fn().mockResolvedValue([]);
    monthlyRecordFindMany = jest.fn().mockResolvedValue([]);
    challengeRecordFindMany = jest.fn().mockResolvedValue([]);
    findAllForParticipant = jest.fn();

    prisma = {
      challengeParticipant: { findUnique: participantFindUnique },
      dailyRecord: { findMany: dailyRecordFindMany },
      weeklyRecord: { findMany: weeklyRecordFindMany },
      monthlyRecord: { findMany: monthlyRecordFindMany },
      challengeRecord: { findMany: challengeRecordFindMany },
    } as unknown as PrismaService;
    goalsService = { findAllForParticipant } as unknown as GoalsService;

    service = new AnalyticsService(prisma, goalsService);
  });

  it('throws NotFoundException when the participant does not exist', async () => {
    participantFindUnique.mockResolvedValue(null);

    await expect(service.getParticipantAnalytics('missing')).rejects.toThrow(NotFoundException);
    expect(findAllForParticipant).not.toHaveBeenCalled();
  });

  it('sums real registered values even when below target (not just completed/not)', async () => {
    // Exemplo do CLAUDE.md: meta de 5h/dia, registros de 5h, 3h e 7h -> soma 15h,
    // mesmo o de 3h não tendo pontuado e o de 7h não tendo bônus.
    participantFindUnique.mockResolvedValue({ id: 'p1' });
    findAllForParticipant.mockResolvedValue([
      { id: 'g1', periodType: GoalPeriod.daily, currentVersion: { kind: GoalKind.hours, targetValue: 5 } },
    ]);
    dailyRecordFindMany.mockResolvedValue([
      { goalId: 'g1', actualValue: 5, actualBoolean: null, kind: GoalKind.hours },
      { goalId: 'g1', actualValue: 3, actualBoolean: null, kind: GoalKind.hours },
      { goalId: 'g1', actualValue: 7, actualBoolean: null, kind: GoalKind.hours },
    ]);

    const result = await service.getParticipantAnalytics('p1');

    expect(dailyRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: { in: ['g1'] } },
      select: SELECT,
    });
    expect(result).toEqual([
      {
        id: 'g1',
        periodType: GoalPeriod.daily,
        currentVersion: { kind: GoalKind.hours, targetValue: 5 },
        recordsCount: 3,
        byKind: [{ kind: GoalKind.hours, recordsCount: 3, sum: 15, average: 5, min: 3, max: 7 }],
      },
    ]);
  });

  it('counts true occurrences for boolean goals instead of summing a value', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1' });
    findAllForParticipant.mockResolvedValue([{ id: 'g2', periodType: GoalPeriod.weekly, currentVersion: null }]);
    weeklyRecordFindMany.mockResolvedValue([
      { goalId: 'g2', actualValue: null, actualBoolean: true, kind: GoalKind.boolean },
      { goalId: 'g2', actualValue: null, actualBoolean: false, kind: GoalKind.boolean },
      { goalId: 'g2', actualValue: null, actualBoolean: true, kind: GoalKind.boolean },
    ]);

    const result = await service.getParticipantAnalytics('p1');

    expect(weeklyRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: { in: ['g2'] } },
      select: SELECT,
    });
    expect(result[0].byKind).toEqual([{ kind: GoalKind.boolean, recordsCount: 3, completedCount: 2 }]);
  });

  it('groups records by their own snapshotted kind, not the goal current version', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1' });
    findAllForParticipant.mockResolvedValue([{ id: 'g3', periodType: GoalPeriod.monthly, currentVersion: null }]);
    // Meta mudou de quantidade para horas no meio da vida; registros antigos
    // continuam com o kind gravado no momento (imutabilidade histórica).
    monthlyRecordFindMany.mockResolvedValue([
      { goalId: 'g3', actualValue: 10, actualBoolean: null, kind: GoalKind.quantity },
      { goalId: 'g3', actualValue: 2, actualBoolean: null, kind: GoalKind.hours },
    ]);

    const result = await service.getParticipantAnalytics('p1');

    expect(result[0].byKind).toEqual(
      expect.arrayContaining([
        { kind: GoalKind.quantity, recordsCount: 1, sum: 10, average: 10, min: 10, max: 10 },
        { kind: GoalKind.hours, recordsCount: 1, sum: 2, average: 2, min: 2, max: 2 },
      ]),
    );
  });

  it('routes to the correct table for each period type', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1' });
    findAllForParticipant.mockResolvedValue([
      { id: 'gm', periodType: GoalPeriod.monthly, currentVersion: null },
      { id: 'gc', periodType: GoalPeriod.challenge, currentVersion: null },
    ]);

    await service.getParticipantAnalytics('p1');

    expect(monthlyRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: { in: ['gm'] } },
      select: SELECT,
    });
    expect(challengeRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: { in: ['gc'] } },
      select: SELECT,
    });
    expect(dailyRecordFindMany).not.toHaveBeenCalled();
    expect(weeklyRecordFindMany).not.toHaveBeenCalled();
  });

  it('returns an empty byKind list and zero recordsCount for a goal with no records yet', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1' });
    findAllForParticipant.mockResolvedValue([{ id: 'g1', periodType: GoalPeriod.daily, currentVersion: null }]);

    const result = await service.getParticipantAnalytics('p1');

    expect(result[0].recordsCount).toBe(0);
    expect(result[0].byKind).toEqual([]);
  });

  it('fetches records for multiple daily goals with a single query (no N+1 per goal)', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1' });
    findAllForParticipant.mockResolvedValue([
      { id: 'g1', periodType: GoalPeriod.daily, currentVersion: null },
      { id: 'g2', periodType: GoalPeriod.daily, currentVersion: null },
      { id: 'g3', periodType: GoalPeriod.daily, currentVersion: null },
    ]);
    dailyRecordFindMany.mockResolvedValue([
      { goalId: 'g1', actualValue: 1, actualBoolean: null, kind: GoalKind.quantity },
      { goalId: 'g2', actualValue: 2, actualBoolean: null, kind: GoalKind.quantity },
    ]);

    const result = await service.getParticipantAnalytics('p1');

    expect(dailyRecordFindMany).toHaveBeenCalledTimes(1);
    expect(dailyRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: { in: ['g1', 'g2', 'g3'] } },
      select: SELECT,
    });
    expect(result.find((g) => g.id === 'g1')?.recordsCount).toBe(1);
    expect(result.find((g) => g.id === 'g2')?.recordsCount).toBe(1);
    expect(result.find((g) => g.id === 'g3')?.recordsCount).toBe(0);
  });
});
