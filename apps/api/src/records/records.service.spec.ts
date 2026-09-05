import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GoalKind, GoalPeriod, ImportanceLevel, ParticipantStatus } from '@prisma/client';
import {
  currentMonthRangeInSaoPaulo,
  currentWeekRangeInSaoPaulo,
  todayInSaoPaulo,
} from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from './records.service';

describe('RecordsService', () => {
  let goalFindUnique: jest.Mock;
  let dailyRecordUpsert: jest.Mock;
  let dailyRecordFindMany: jest.Mock;
  let weeklyRecordUpsert: jest.Mock;
  let monthlyRecordUpsert: jest.Mock;
  let challengeRecordUpsert: jest.Mock;
  let participantFindUnique: jest.Mock;
  let dayResultFindMany: jest.Mock;
  let prisma: PrismaService;
  let service: RecordsService;

  const activeParticipant = { id: 'p1', userId: 'u1', status: ParticipantStatus.active };
  const openHoursVersion = {
    id: 'v1',
    kind: GoalKind.hours,
    importance: ImportanceLevel.high,
    targetValue: 2,
  };
  const openBooleanVersion = {
    id: 'v2',
    kind: GoalKind.boolean,
    importance: ImportanceLevel.medium,
    targetValue: null,
  };

  beforeEach(() => {
    goalFindUnique = jest.fn();
    dailyRecordUpsert = jest.fn();
    dailyRecordFindMany = jest.fn();
    weeklyRecordUpsert = jest.fn();
    monthlyRecordUpsert = jest.fn();
    challengeRecordUpsert = jest.fn();
    participantFindUnique = jest.fn();
    dayResultFindMany = jest.fn();

    prisma = {
      goal: { findUnique: goalFindUnique },
      dailyRecord: { upsert: dailyRecordUpsert, findMany: dailyRecordFindMany },
      weeklyRecord: { upsert: weeklyRecordUpsert },
      monthlyRecord: { upsert: monthlyRecordUpsert },
      challengeRecord: { upsert: challengeRecordUpsert },
      challengeParticipant: { findUnique: participantFindUnique },
      dayResult: { findMany: dayResultFindMany },
    } as unknown as PrismaService;

    service = new RecordsService(prisma);
  });

  it('upserts a daily record for an hours/quantity goal using actualValue', async () => {
    goalFindUnique.mockResolvedValue({
      id: 'g1',
      periodType: GoalPeriod.daily,
      challengeParticipantId: 'p1',
      challengeParticipant: activeParticipant,
      versions: [openHoursVersion],
    });
    dailyRecordUpsert.mockResolvedValue({ id: 'r1', completed: false, pointsAwarded: 0 });

    const result = await service.recordToday('g1', 'u1', { actualValue: 1.5 });

    const today = new Date(todayInSaoPaulo());
    expect(dailyRecordUpsert).toHaveBeenCalledWith({
      where: { goalId_recordDate: { goalId: 'g1', recordDate: today } },
      create: {
        goalId: 'g1',
        goalVersionId: 'v1',
        challengeParticipantId: 'p1',
        recordDate: today,
        actualValue: 1.5,
        actualBoolean: undefined,
        kind: GoalKind.hours,
        importance: ImportanceLevel.high,
        targetValueSnapshot: 2,
      },
      update: {
        goalVersionId: 'v1',
        actualValue: 1.5,
        actualBoolean: null,
        kind: GoalKind.hours,
        importance: ImportanceLevel.high,
        targetValueSnapshot: 2,
      },
    });
    expect(result).toEqual({ id: 'r1', completed: false, pointsAwarded: 0 });
  });

  it('upserts a daily record for a boolean goal using actualBoolean', async () => {
    goalFindUnique.mockResolvedValue({
      id: 'g2',
      periodType: GoalPeriod.daily,
      challengeParticipantId: 'p1',
      challengeParticipant: activeParticipant,
      versions: [openBooleanVersion],
    });
    dailyRecordUpsert.mockResolvedValue({ id: 'r2', completed: true, pointsAwarded: 20 });

    await service.recordToday('g2', 'u1', { actualBoolean: true });

    expect(dailyRecordUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ actualBoolean: true, actualValue: undefined }),
      }),
    );
  });

  it('throws NotFoundException when the goal does not exist', async () => {
    goalFindUnique.mockResolvedValue(null);

    await expect(service.recordToday('missing', 'u1', { actualValue: 1 })).rejects.toThrow(NotFoundException);
    expect(dailyRecordUpsert).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the goal belongs to another participant', async () => {
    goalFindUnique.mockResolvedValue({
      id: 'g1',
      periodType: GoalPeriod.daily,
      challengeParticipant: { ...activeParticipant, userId: 'someone-else' },
      versions: [openHoursVersion],
    });

    await expect(service.recordToday('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ForbiddenException);
    expect(dailyRecordUpsert).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the goal is not daily', async () => {
    goalFindUnique.mockResolvedValue({
      id: 'g1',
      periodType: GoalPeriod.weekly,
      challengeParticipant: activeParticipant,
      versions: [openHoursVersion],
    });

    await expect(service.recordToday('g1', 'u1', { actualValue: 1 })).rejects.toThrow(BadRequestException);
    expect(dailyRecordUpsert).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when the participant already left the challenge', async () => {
    goalFindUnique.mockResolvedValue({
      id: 'g1',
      periodType: GoalPeriod.daily,
      challengeParticipant: { ...activeParticipant, status: ParticipantStatus.inactive },
      versions: [openHoursVersion],
    });

    await expect(service.recordToday('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ForbiddenException);
    expect(dailyRecordUpsert).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the goal has no open version', async () => {
    goalFindUnique.mockResolvedValue({
      id: 'g1',
      periodType: GoalPeriod.daily,
      challengeParticipant: activeParticipant,
      versions: [],
    });

    await expect(service.recordToday('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ConflictException);
    expect(dailyRecordUpsert).not.toHaveBeenCalled();
  });

  describe('actual value/kind mismatches', () => {
    it('rejects a boolean goal recorded without actualBoolean', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g2',
        periodType: GoalPeriod.daily,
        challengeParticipant: activeParticipant,
        versions: [openBooleanVersion],
      });

      await expect(service.recordToday('g2', 'u1', {})).rejects.toThrow(BadRequestException);
    });

    it('rejects a boolean goal recorded with actualValue', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g2',
        periodType: GoalPeriod.daily,
        challengeParticipant: activeParticipant,
        versions: [openBooleanVersion],
      });

      await expect(service.recordToday('g2', 'u1', { actualBoolean: true, actualValue: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an hours goal recorded without actualValue', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.daily,
        challengeParticipant: activeParticipant,
        versions: [openHoursVersion],
      });

      await expect(service.recordToday('g1', 'u1', {})).rejects.toThrow(BadRequestException);
    });

    it('rejects an hours goal recorded with actualBoolean', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.daily,
        challengeParticipant: activeParticipant,
        versions: [openHoursVersion],
      });

      await expect(service.recordToday('g1', 'u1', { actualValue: 1, actualBoolean: true })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('recordCurrentWeek', () => {
    it('upserts a weekly record keyed by the Monday of the current civil week', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.weekly,
        challengeParticipantId: 'p1',
        challengeParticipant: activeParticipant,
        versions: [openHoursVersion],
      });
      weeklyRecordUpsert.mockResolvedValue({ id: 'wr1', completed: true, pointsAwarded: 90 });

      const result = await service.recordCurrentWeek('g1', 'u1', { actualValue: 5 });

      const { periodStart, periodEnd } = currentWeekRangeInSaoPaulo();
      const start = new Date(periodStart);
      const end = new Date(periodEnd);
      expect(weeklyRecordUpsert).toHaveBeenCalledWith({
        where: { goalId_periodStart: { goalId: 'g1', periodStart: start } },
        create: {
          goalId: 'g1',
          goalVersionId: 'v1',
          challengeParticipantId: 'p1',
          periodStart: start,
          periodEnd: end,
          actualValue: 5,
          actualBoolean: undefined,
          kind: GoalKind.hours,
          importance: ImportanceLevel.high,
          targetValueSnapshot: 2,
        },
        update: {
          goalVersionId: 'v1',
          actualValue: 5,
          actualBoolean: null,
          kind: GoalKind.hours,
          importance: ImportanceLevel.high,
          targetValueSnapshot: 2,
        },
      });
      expect(result).toEqual({ id: 'wr1', completed: true, pointsAwarded: 90 });
    });

    it('throws BadRequestException when the goal is not weekly', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.daily,
        challengeParticipant: activeParticipant,
        versions: [openHoursVersion],
      });

      await expect(service.recordCurrentWeek('g1', 'u1', { actualValue: 1 })).rejects.toThrow(BadRequestException);
      expect(weeklyRecordUpsert).not.toHaveBeenCalled();
    });
  });

  describe('recordCurrentMonth', () => {
    it('upserts a monthly record keyed by the 1st of the current civil month', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g2',
        periodType: GoalPeriod.monthly,
        challengeParticipantId: 'p1',
        challengeParticipant: activeParticipant,
        versions: [openBooleanVersion],
      });
      monthlyRecordUpsert.mockResolvedValue({ id: 'mr1', completed: true, pointsAwarded: 80 });

      await service.recordCurrentMonth('g2', 'u1', { actualBoolean: true });

      const { periodStart, periodEnd } = currentMonthRangeInSaoPaulo();
      const start = new Date(periodStart);
      const end = new Date(periodEnd);
      expect(monthlyRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { goalId_periodStart: { goalId: 'g2', periodStart: start } },
          create: expect.objectContaining({ periodStart: start, periodEnd: end, actualBoolean: true, actualValue: undefined }),
        }),
      );
    });

    it('throws BadRequestException when the goal is not monthly', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.weekly,
        challengeParticipant: activeParticipant,
        versions: [openHoursVersion],
      });

      await expect(service.recordCurrentMonth('g1', 'u1', { actualValue: 1 })).rejects.toThrow(BadRequestException);
      expect(monthlyRecordUpsert).not.toHaveBeenCalled();
    });
  });

  describe('recordCurrentChallenge', () => {
    // Datas relativas a "hoje" (em vez de literais fixas), para os testes
    // continuarem válidos em qualquer dia em que a suíte rodar — mesmo
    // padrão de recordCurrentWeek/Month, que também derivam o período
    // esperado a partir de todayInSaoPaulo() no momento do teste.
    const today = new Date(`${todayInSaoPaulo()}T12:00:00Z`);
    function daysFromToday(offset: number): Date {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + offset);
      return date;
    }

    it('upserts a challenge record keyed only by goalId, with periodStart = joinedAt and periodEnd = challenge.endDate', async () => {
      const joinedAt = daysFromToday(-10); // entrou 10 dias atrás, num desafio de 30 dias
      const challengeEndDate = daysFromToday(20);
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.challenge,
        challengeParticipantId: 'p1',
        challengeParticipant: {
          ...activeParticipant,
          joinedAt,
          challenge: { endDate: challengeEndDate },
        },
        versions: [openHoursVersion],
      });
      challengeRecordUpsert.mockResolvedValue({ id: 'cr1', completed: false, pointsAwarded: 0 });

      const result = await service.recordCurrentChallenge('g1', 'u1', { actualValue: 50 });

      const expectedStart = new Date(todayInSaoPaulo(joinedAt));
      const expectedEnd = new Date(challengeEndDate.toISOString().slice(0, 10));
      expect(challengeRecordUpsert).toHaveBeenCalledWith({
        where: { goalId: 'g1' },
        create: {
          goalId: 'g1',
          goalVersionId: 'v1',
          challengeParticipantId: 'p1',
          periodStart: expectedStart,
          periodEnd: expectedEnd,
          actualValue: 50,
          actualBoolean: undefined,
          kind: GoalKind.hours,
          importance: ImportanceLevel.high,
          targetValueSnapshot: 2,
        },
        update: {
          goalVersionId: 'v1',
          actualValue: 50,
          actualBoolean: null,
          kind: GoalKind.hours,
          importance: ImportanceLevel.high,
          targetValueSnapshot: 2,
        },
      });
      expect(result).toEqual({ id: 'cr1', completed: false, pointsAwarded: 0 });
    });

    it('reduces to the full challenge window for a participant who joined on the challenge start date', async () => {
      const joinedAt = daysFromToday(-15);
      const challengeEndDate = daysFromToday(15);
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.challenge,
        challengeParticipantId: 'p1',
        challengeParticipant: { ...activeParticipant, joinedAt, challenge: { endDate: challengeEndDate } },
        versions: [openHoursVersion],
      });
      challengeRecordUpsert.mockResolvedValue({});

      await service.recordCurrentChallenge('g1', 'u1', { actualValue: 50 });

      expect(challengeRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            periodStart: new Date(todayInSaoPaulo(joinedAt)),
            periodEnd: new Date(challengeEndDate.toISOString().slice(0, 10)),
          }),
        }),
      );
    });

    it('throws ForbiddenException when the challenge has already ended', async () => {
      const joinedAt = daysFromToday(-40);
      const challengeEndDate = daysFromToday(-10); // já passou
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.challenge,
        challengeParticipant: { ...activeParticipant, joinedAt, challenge: { endDate: challengeEndDate } },
        versions: [openHoursVersion],
      });

      await expect(service.recordCurrentChallenge('g1', 'u1', { actualValue: 1 })).rejects.toThrow(
        ForbiddenException,
      );
      expect(challengeRecordUpsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the goal is not a duration goal', async () => {
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.monthly,
        challengeParticipant: activeParticipant,
        versions: [openHoursVersion],
      });

      await expect(service.recordCurrentChallenge('g1', 'u1', { actualValue: 1 })).rejects.toThrow(
        BadRequestException,
      );
      expect(challengeRecordUpsert).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns only closed days, each with its matching records, most recent first', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1' });
      const day1 = new Date('2026-01-02');
      const day2 = new Date('2026-01-01');
      dayResultFindMany.mockResolvedValue([
        { resultDate: day1, completedGoalsCount: 3, dayCompleted: true, streakAfter: 2 },
        { resultDate: day2, completedGoalsCount: 1, dayCompleted: false, streakAfter: 0 },
      ]);
      const recordDay1 = { id: 'r1', recordDate: day1, completed: true, pointsAwarded: 30 };
      dailyRecordFindMany.mockResolvedValue([recordDay1]);

      const result = await service.getHistory('p1');

      expect(dayResultFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1', closed: true },
        orderBy: { resultDate: 'desc' },
      });
      expect(dailyRecordFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1', recordDate: { in: [day1, day2] } },
        orderBy: { recordDate: 'desc' },
      });
      expect(result).toEqual([
        { date: day1, completedGoalsCount: 3, dayCompleted: true, streakAfter: 2, records: [recordDay1] },
        { date: day2, completedGoalsCount: 1, dayCompleted: false, streakAfter: 0, records: [] },
      ]);
    });

    it('returns an empty list when there are no closed days yet, without querying daily_records', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1' });
      dayResultFindMany.mockResolvedValue([]);

      await expect(service.getHistory('p1')).resolves.toEqual([]);
      expect(dailyRecordFindMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the participant does not exist', async () => {
      participantFindUnique.mockResolvedValue(null);

      await expect(service.getHistory('missing')).rejects.toThrow(NotFoundException);
      expect(dayResultFindMany).not.toHaveBeenCalled();
    });
  });
});
