import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengesService } from './challenges.service';

describe('ChallengesService', () => {
  let challengeCreate: jest.Mock;
  let challengeFindUnique: jest.Mock;
  let participantCreate: jest.Mock;
  let participantFindUnique: jest.Mock;
  let transaction: jest.Mock;
  let prisma: PrismaService;
  let service: ChallengesService;

  beforeEach(() => {
    challengeCreate = jest.fn();
    challengeFindUnique = jest.fn();
    participantCreate = jest.fn();
    participantFindUnique = jest.fn();

    // $transaction aqui só encaminha o callback para um "tx" que reusa os
    // mesmos mocks de challenge/challengeParticipant — suficiente para
    // testar o que o service manda gravar, sem um Postgres real.
    transaction = jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        challenge: { create: challengeCreate },
        challengeParticipant: { create: participantCreate },
      }),
    );

    prisma = {
      challenge: { create: challengeCreate, findUnique: challengeFindUnique },
      challengeParticipant: { create: participantCreate, findUnique: participantFindUnique },
      $transaction: transaction,
    } as unknown as PrismaService;

    service = new ChallengesService(prisma);
  });

  describe('create', () => {
    it('creates the challenge and auto-enrolls the creator as a participant in one transaction', async () => {
      const challenge = { id: 'c1', name: 'Correr 30 dias', durationDays: 30 };
      challengeCreate.mockResolvedValue(challenge);
      participantCreate.mockResolvedValue({ id: 'p1', challengeId: 'c1', userId: 'u1' });

      const result = await service.create('u1', {
        name: 'Correr 30 dias',
        durationDays: 30,
        startDate: '2026-09-10',
      });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(challengeCreate).toHaveBeenCalledWith({
        data: {
          name: 'Correr 30 dias',
          description: undefined,
          durationDays: 30,
          startDate: new Date('2026-09-10'),
          createdBy: 'u1',
        },
      });
      expect(participantCreate).toHaveBeenCalledWith({
        data: { challengeId: 'c1', userId: 'u1' },
      });
      expect(result).toEqual(challenge);
    });
  });

  describe('findById', () => {
    it('returns the challenge when found', async () => {
      const challenge = { id: 'c1', name: 'Correr 30 dias' };
      challengeFindUnique.mockResolvedValue(challenge);

      await expect(service.findById('c1')).resolves.toEqual(challenge);
      expect(challengeFindUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('throws NotFoundException when missing', async () => {
      challengeFindUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('join', () => {
    it('normalizes the join code and creates a participant when not already joined', async () => {
      challengeFindUnique.mockResolvedValue({ id: 'c1', joinCode: 'ABCD1234' });
      participantFindUnique.mockResolvedValue(null);
      participantCreate.mockResolvedValue({ id: 'p1', challengeId: 'c1', userId: 'u2' });

      const result = await service.join('u2', { joinCode: ' abcd1234 ' });

      expect(challengeFindUnique).toHaveBeenCalledWith({ where: { joinCode: 'ABCD1234' } });
      expect(participantCreate).toHaveBeenCalledWith({
        data: { challengeId: 'c1', userId: 'u2' },
      });
      expect(result).toEqual({ id: 'p1', challengeId: 'c1', userId: 'u2' });
    });

    it('throws NotFoundException when no challenge matches the code', async () => {
      challengeFindUnique.mockResolvedValue(null);

      await expect(service.join('u2', { joinCode: 'ZZZZZZZZ' })).rejects.toThrow(NotFoundException);
      expect(participantCreate).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the user already participates', async () => {
      challengeFindUnique.mockResolvedValue({ id: 'c1', joinCode: 'ABCD1234' });
      participantFindUnique.mockResolvedValue({ id: 'p1', challengeId: 'c1', userId: 'u2' });

      await expect(service.join('u2', { joinCode: 'ABCD1234' })).rejects.toThrow(ConflictException);
      expect(participantCreate).not.toHaveBeenCalled();
    });

    it('translates a unique-constraint race into ConflictException', async () => {
      challengeFindUnique.mockResolvedValue({ id: 'c1', joinCode: 'ABCD1234' });
      participantFindUnique.mockResolvedValue(null);
      participantCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.join('u2', { joinCode: 'ABCD1234' })).rejects.toThrow(ConflictException);
    });
  });
});
