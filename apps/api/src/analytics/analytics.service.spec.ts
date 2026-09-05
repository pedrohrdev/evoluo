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

  beforeEach(() => {
    participantFindUnique = jest.fn();
    dailyRecordFindMany = jest.fn();
    weeklyRecordFindMany = jest.fn();
    monthlyRecordFindMany = jest.fn();
    challengeRecordFindMany = jest.fn();
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
      { actualValue: 5, actualBoolean: null, kind: GoalKind.hours },
      { actualValue: 3, actualBoolean: null, kind: GoalKind.hours },
      { actualValue: 7, actualBoolean: null, kind: GoalKind.hours },
    ]);

    const result = await service.getParticipantAnalytics('p1');

    expect(dailyRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: 'g1' },
      select: { actualValue: true, actualBoolean: true, kind: true },
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
      { actualValue: null, actualBoolean: true, kind: GoalKind.boolean },
      { actualValue: null, actualBoolean: false, kind: GoalKind.boolean },
      { actualValue: null, actualBoolean: true, kind: GoalKind.boolean },
    ]);

    const result = await service.getParticipantAnalytics('p1');

    expect(weeklyRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: 'g2' },
      select: { actualValue: true, actualBoolean: true, kind: true },
    });
    expect(result[0].byKind).toEqual([{ kind: GoalKind.boolean, recordsCount: 3, completedCount: 2 }]);
  });

  it('groups records by their own snapshotted kind, not the goal current version', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1' });
    findAllForParticipant.mockResolvedValue([{ id: 'g3', periodType: GoalPeriod.monthly, currentVersion: null }]);
    // Meta mudou de quantidade para horas no meio da vida; registros antigos
    // continuam com o kind gravado no momento (imutabilidade histórica).
    monthlyRecordFindMany.mockResolvedValue([
      { actualValue: 10, actualBoolean: null, kind: GoalKind.quantity },
      { actualValue: 2, actualBoolean: null, kind: GoalKind.hours },
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
    monthlyRecordFindMany.mockResolvedValue([]);
    challengeRecordFindMany.mockResolvedValue([]);

    await service.getParticipantAnalytics('p1');

    expect(monthlyRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: 'gm' },
      select: { actualValue: true, actualBoolean: true, kind: true },
    });
    expect(challengeRecordFindMany).toHaveBeenCalledWith({
      where: { goalId: 'gc' },
      select: { actualValue: true, actualBoolean: true, kind: true },
    });
  });

  it('returns an empty byKind list and zero recordsCount for a goal with no records yet', async () => {
    participantFindUnique.mockResolvedValue({ id: 'p1' });
    findAllForParticipant.mockResolvedValue([{ id: 'g1', periodType: GoalPeriod.daily, currentVersion: null }]);
    dailyRecordFindMany.mockResolvedValue([]);

    const result = await service.getParticipantAnalytics('p1');

    expect(result[0].recordsCount).toBe(0);
    expect(result[0].byKind).toEqual([]);
  });
});
