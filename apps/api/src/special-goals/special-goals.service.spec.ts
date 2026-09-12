import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SpecialGoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialGoalsService } from './special-goals.service';

describe('SpecialGoalsService', () => {
  let participantFindUnique: jest.Mock;
  let specialGoalCreate: jest.Mock;
  let specialGoalFindMany: jest.Mock;
  let specialGoalFindUnique: jest.Mock;
  let specialGoalUpdate: jest.Mock;
  let prisma: PrismaService;
  let service: SpecialGoalsService;

  beforeEach(() => {
    participantFindUnique = jest.fn();
    specialGoalCreate = jest.fn();
    specialGoalFindMany = jest.fn();
    specialGoalFindUnique = jest.fn();
    specialGoalUpdate = jest.fn();

    prisma = {
      challengeParticipant: { findUnique: participantFindUnique },
      specialGoal: {
        create: specialGoalCreate,
        findMany: specialGoalFindMany,
        findUnique: specialGoalFindUnique,
        update: specialGoalUpdate,
      },
    } as unknown as PrismaService;

    service = new SpecialGoalsService(prisma);
  });

  describe('create', () => {
    const dto = { toParticipantId: 'p2', title: 'Correr 5km' };

    it('creates the special goal when the user owns the from-participant and the target is in the same challenge', async () => {
      participantFindUnique.mockResolvedValueOnce({ id: 'p1', challengeId: 'c1', userId: 'u1' });
      participantFindUnique.mockResolvedValueOnce({ id: 'p2', challengeId: 'c1', userId: 'u2' });
      specialGoalCreate.mockResolvedValue({ id: 'sg1' });

      const result = await service.create('c1', 'u1', dto);

      expect(specialGoalCreate).toHaveBeenCalledWith({
        data: { challengeId: 'c1', fromParticipantId: 'p1', toParticipantId: 'p2', title: dto.title },
      });
      expect(result).toEqual({ id: 'sg1' });
    });

    it('rejects when the user is not a participant of the challenge', async () => {
      participantFindUnique.mockResolvedValueOnce(null);

      await expect(service.create('c1', 'u1', dto)).rejects.toThrow(ForbiddenException);
      expect(specialGoalCreate).not.toHaveBeenCalled();
    });

    it('rejects assigning a special goal to yourself', async () => {
      participantFindUnique.mockResolvedValueOnce({ id: 'p1', challengeId: 'c1', userId: 'u1' });

      await expect(service.create('c1', 'u1', { ...dto, toParticipantId: 'p1' })).rejects.toThrow(
        BadRequestException,
      );
      expect(specialGoalCreate).not.toHaveBeenCalled();
    });

    it('rejects when the target participant belongs to a different challenge', async () => {
      participantFindUnique.mockResolvedValueOnce({ id: 'p1', challengeId: 'c1', userId: 'u1' });
      participantFindUnique.mockResolvedValueOnce({ id: 'p2', challengeId: 'other', userId: 'u2' });

      await expect(service.create('c1', 'u1', dto)).rejects.toThrow(NotFoundException);
      expect(specialGoalCreate).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('lets the target participant mark a pending special goal as completed', async () => {
      specialGoalFindUnique.mockResolvedValue({
        id: 'sg1',
        status: SpecialGoalStatus.pending,
        fromParticipant: { userId: 'u1' },
        toParticipant: { userId: 'u2' },
      });
      specialGoalUpdate.mockResolvedValue({ id: 'sg1', status: SpecialGoalStatus.completed });

      const result = await service.complete('sg1', 'u2');

      expect(specialGoalUpdate).toHaveBeenCalledWith({
        where: { id: 'sg1' },
        data: { status: SpecialGoalStatus.completed, completedAt: expect.any(Date) },
      });
      expect(result.status).toBe(SpecialGoalStatus.completed);
    });

    it('rejects when the caller is not the target participant', async () => {
      specialGoalFindUnique.mockResolvedValue({
        id: 'sg1',
        status: SpecialGoalStatus.pending,
        fromParticipant: { userId: 'u1' },
        toParticipant: { userId: 'u2' },
      });

      await expect(service.complete('sg1', 'u1')).rejects.toThrow(ForbiddenException);
      expect(specialGoalUpdate).not.toHaveBeenCalled();
    });

    it('rejects when the special goal is no longer pending', async () => {
      specialGoalFindUnique.mockResolvedValue({
        id: 'sg1',
        status: SpecialGoalStatus.cancelled,
        fromParticipant: { userId: 'u1' },
        toParticipant: { userId: 'u2' },
      });

      await expect(service.complete('sg1', 'u2')).rejects.toThrow(BadRequestException);
      expect(specialGoalUpdate).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('lets the creator cancel a pending special goal', async () => {
      specialGoalFindUnique.mockResolvedValue({
        id: 'sg1',
        status: SpecialGoalStatus.pending,
        fromParticipant: { userId: 'u1' },
        toParticipant: { userId: 'u2' },
      });
      specialGoalUpdate.mockResolvedValue({ id: 'sg1', status: SpecialGoalStatus.cancelled });

      const result = await service.cancel('sg1', 'u1');

      expect(specialGoalUpdate).toHaveBeenCalledWith({
        where: { id: 'sg1' },
        data: { status: SpecialGoalStatus.cancelled, cancelledAt: expect.any(Date) },
      });
      expect(result.status).toBe(SpecialGoalStatus.cancelled);
    });

    it('rejects when the caller did not create the special goal', async () => {
      specialGoalFindUnique.mockResolvedValue({
        id: 'sg1',
        status: SpecialGoalStatus.pending,
        fromParticipant: { userId: 'u1' },
        toParticipant: { userId: 'u2' },
      });

      await expect(service.cancel('sg1', 'u2')).rejects.toThrow(ForbiddenException);
      expect(specialGoalUpdate).not.toHaveBeenCalled();
    });

    it('rejects when the special goal does not exist', async () => {
      specialGoalFindUnique.mockResolvedValue(null);

      await expect(service.cancel('missing', 'u1')).rejects.toThrow(NotFoundException);
    });
  });
});
