import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GoalKind, GoalPeriod, ImportanceLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

describe('GoalsService', () => {
  let participantFindUnique: jest.Mock;
  let goalCount: jest.Mock;
  let goalFindFirst: jest.Mock;
  let goalFindUnique: jest.Mock;
  let goalFindMany: jest.Mock;
  let goalCreate: jest.Mock;
  let goalVersionCreate: jest.Mock;
  let goalVersionUpdateMany: jest.Mock;
  let transaction: jest.Mock;
  let prisma: PrismaService;
  let service: GoalsService;

  const baseDto = {
    periodType: GoalPeriod.daily,
    kind: GoalKind.hours,
    importance: ImportanceLevel.high,
    title: 'Estudar inglês',
    targetValue: 2,
  };

  beforeEach(() => {
    participantFindUnique = jest.fn();
    goalCount = jest.fn().mockResolvedValue(0);
    goalFindFirst = jest.fn().mockResolvedValue(null);
    goalFindUnique = jest.fn();
    goalFindMany = jest.fn();
    goalCreate = jest.fn();
    goalVersionCreate = jest.fn();
    goalVersionUpdateMany = jest.fn();

    transaction = jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        goal: { create: goalCreate },
        goalVersion: { create: goalVersionCreate, updateMany: goalVersionUpdateMany },
      }),
    );

    prisma = {
      challengeParticipant: { findUnique: participantFindUnique },
      goal: { count: goalCount, findFirst: goalFindFirst, findUnique: goalFindUnique, findMany: goalFindMany },
      $transaction: transaction,
    } as unknown as PrismaService;

    service = new GoalsService(prisma);
  });

  describe('create', () => {
    it('creates the goal and its first version in one transaction when everything checks out', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      goalCreate.mockResolvedValue({ id: 'g1', challengeParticipantId: 'p1', periodType: GoalPeriod.daily });
      goalVersionCreate.mockResolvedValue({ id: 'v1', goalId: 'g1', ...baseDto });

      const result = await service.create('p1', 'u1', baseDto);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(goalCreate).toHaveBeenCalledWith({
        data: { challengeParticipantId: 'p1', periodType: GoalPeriod.daily },
      });
      expect(goalVersionCreate).toHaveBeenCalledWith({
        data: {
          goalId: 'g1',
          kind: GoalKind.hours,
          importance: ImportanceLevel.high,
          title: 'Estudar inglês',
          targetValue: 2,
        },
      });
      expect(result).toEqual({
        id: 'g1',
        challengeParticipantId: 'p1',
        periodType: GoalPeriod.daily,
        currentVersion: { id: 'v1', goalId: 'g1', ...baseDto },
      });
    });

    it('throws NotFoundException when the participant does not exist', async () => {
      participantFindUnique.mockResolvedValue(null);

      await expect(service.create('missing', 'u1', baseDto)).rejects.toThrow(NotFoundException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the participant belongs to another user', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', userId: 'someone-else' });

      await expect(service.create('p1', 'u1', baseDto)).rejects.toThrow(ForbiddenException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a boolean goal is created with a targetValue', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });

      await expect(
        service.create('p1', 'u1', { ...baseDto, kind: GoalKind.boolean, targetValue: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the participant already has 3 daily goals', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      goalCount.mockResolvedValue(3);

      await expect(service.create('p1', 'u1', baseDto)).rejects.toThrow(ConflictException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a single-instance period goal already exists', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      goalFindFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create('p1', 'u1', { ...baseDto, periodType: GoalPeriod.weekly }),
      ).rejects.toThrow(ConflictException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('translates a unique-constraint race into ConflictException', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(
        service.create('p1', 'u1', { ...baseDto, periodType: GoalPeriod.weekly }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllForParticipant', () => {
    it('maps the open version of each goal to currentVersion', async () => {
      goalFindMany.mockResolvedValue([
        { id: 'g1', periodType: GoalPeriod.daily, versions: [{ id: 'v1', validUntil: null }] },
        { id: 'g2', periodType: GoalPeriod.weekly, versions: [] },
      ]);

      const result = await service.findAllForParticipant('p1');

      expect(goalFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1' },
        include: { versions: { where: { validUntil: null } } },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        { id: 'g1', periodType: GoalPeriod.daily, currentVersion: { id: 'v1', validUntil: null } },
        { id: 'g2', periodType: GoalPeriod.weekly, currentVersion: null },
      ]);
    });
  });

  describe('findAllForParticipants', () => {
    it('fetches every participant in a single query and groups goals by participant', async () => {
      goalFindMany.mockResolvedValue([
        {
          id: 'g1',
          challengeParticipantId: 'p1',
          periodType: GoalPeriod.daily,
          versions: [{ id: 'v1', validUntil: null }],
        },
        { id: 'g2', challengeParticipantId: 'p2', periodType: GoalPeriod.weekly, versions: [] },
      ]);

      const result = await service.findAllForParticipants(['p1', 'p2']);

      expect(goalFindMany).toHaveBeenCalledTimes(1);
      expect(goalFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: { in: ['p1', 'p2'] } },
        include: { versions: { where: { validUntil: null } } },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.get('p1')).toEqual([
        { id: 'g1', challengeParticipantId: 'p1', periodType: GoalPeriod.daily, currentVersion: { id: 'v1', validUntil: null } },
      ]);
      expect(result.get('p2')).toEqual([
        { id: 'g2', challengeParticipantId: 'p2', periodType: GoalPeriod.weekly, currentVersion: null },
      ]);
    });

    it('returns an empty map without querying when there are no participants', async () => {
      const result = await service.findAllForParticipants([]);

      expect(result.size).toBe(0);
      expect(goalFindMany).not.toHaveBeenCalled();
    });
  });

  describe('setVersion', () => {
    const updateDto = {
      kind: GoalKind.hours,
      importance: ImportanceLevel.medium,
      title: 'Estudar inglês (revisado)',
      targetValue: 3,
    };

    it('closes the current open version and creates a new one', async () => {
      goalFindUnique.mockResolvedValue({ id: 'g1', challengeParticipant: { userId: 'u1' } });
      goalVersionCreate.mockResolvedValue({ id: 'v2', goalId: 'g1', ...updateDto });

      const result = await service.setVersion('g1', 'u1', updateDto);

      expect(goalVersionUpdateMany).toHaveBeenCalledWith({
        where: { goalId: 'g1', validUntil: null },
        data: { validUntil: expect.any(Date) },
      });
      expect(goalVersionCreate).toHaveBeenCalledWith({
        data: { goalId: 'g1', ...updateDto },
      });
      expect(result).toEqual({ id: 'v2', goalId: 'g1', ...updateDto });
    });

    it('throws NotFoundException when the goal does not exist', async () => {
      goalFindUnique.mockResolvedValue(null);

      await expect(service.setVersion('missing', 'u1', updateDto)).rejects.toThrow(NotFoundException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the goal belongs to another participant', async () => {
      goalFindUnique.mockResolvedValue({ id: 'g1', challengeParticipant: { userId: 'someone-else' } });

      await expect(service.setVersion('g1', 'u1', updateDto)).rejects.toThrow(ForbiddenException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when switching to boolean while keeping a targetValue', async () => {
      goalFindUnique.mockResolvedValue({ id: 'g1', challengeParticipant: { userId: 'u1' } });

      await expect(
        service.setVersion('g1', 'u1', { ...updateDto, kind: GoalKind.boolean, targetValue: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    });
  });
});
