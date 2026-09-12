import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ParticipantStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengesService } from './challenges.service';

describe('ChallengesService', () => {
  let challengeCreate: jest.Mock;
  let challengeFindUnique: jest.Mock;
  let challengeDelete: jest.Mock;
  let participantCreate: jest.Mock;
  let participantFindUnique: jest.Mock;
  let participantUpdate: jest.Mock;
  let participantCount: jest.Mock;
  let executeRaw: jest.Mock;
  let transaction: jest.Mock;
  let prisma: PrismaService;
  let service: ChallengesService;

  beforeEach(() => {
    challengeCreate = jest.fn();
    challengeFindUnique = jest.fn();
    challengeDelete = jest.fn();
    participantCreate = jest.fn();
    participantFindUnique = jest.fn();
    participantUpdate = jest.fn();
    participantCount = jest.fn();
    executeRaw = jest.fn().mockResolvedValue(undefined);

    // $transaction aqui só encaminha o callback para um "tx" que reusa os
    // mesmos mocks de challenge/challengeParticipant — suficiente para
    // testar o que o service manda gravar, sem um Postgres real.
    transaction = jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        challenge: { create: challengeCreate, delete: challengeDelete },
        challengeParticipant: { create: participantCreate },
        $executeRaw: executeRaw,
      }),
    );

    prisma = {
      challenge: { create: challengeCreate, findUnique: challengeFindUnique, delete: challengeDelete },
      challengeParticipant: {
        create: participantCreate,
        findUnique: participantFindUnique,
        update: participantUpdate,
        count: participantCount,
      },
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
      // join_code NUNCA sai daqui: é o único controle de acesso de entrada
      // no desafio, e o id do desafio é público (aparece no perfil de
      // qualquer participante). Ver ChallengesService.findJoinCode.
      expect(challengeFindUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        select: {
          id: true,
          name: true,
          description: true,
          durationDays: true,
          startDate: true,
          endDate: true,
          createdBy: true,
          createdAt: true,
        },
      });
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

    it('propagates an unrelated database error instead of misreporting it as a conflict', async () => {
      challengeFindUnique.mockResolvedValue({ id: 'c1', joinCode: 'ABCD1234' });
      participantFindUnique.mockResolvedValue(null);
      const unrelatedError = new Error('connection reset');
      participantCreate.mockRejectedValue(unrelatedError);

      await expect(service.join('u2', { joinCode: 'ABCD1234' })).rejects.toThrow(unrelatedError);
    });
  });

  describe('remove', () => {
    it('lets the creator delete the challenge after lifting the goal_versions immutability bypass', async () => {
      challengeFindUnique.mockResolvedValue({ id: 'c1', createdBy: 'u1' });
      challengeDelete.mockResolvedValue({ id: 'c1' });

      await service.remove('c1', 'u1');

      expect(challengeFindUnique).toHaveBeenCalledWith({
        where: { id: 'c1' },
        select: { id: true, createdBy: true },
      });
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(executeRaw).toHaveBeenCalledTimes(1);
      expect(challengeDelete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('throws NotFoundException when the challenge does not exist', async () => {
      challengeFindUnique.mockResolvedValue(null);

      await expect(service.remove('missing', 'u1')).rejects.toThrow(NotFoundException);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the requester is not the creator', async () => {
      challengeFindUnique.mockResolvedValue({ id: 'c1', createdBy: 'someone-else' });

      await expect(service.remove('c1', 'u1')).rejects.toThrow(ForbiddenException);
      expect(transaction).not.toHaveBeenCalled();
      expect(challengeDelete).not.toHaveBeenCalled();
    });
  });

  describe('findJoinCode', () => {
    it('returns the code for a participant of the challenge', async () => {
      challengeFindUnique.mockResolvedValue({ id: 'c1', joinCode: 'ABCD2345' });
      participantFindUnique.mockResolvedValue({ id: 'p1' });

      await expect(service.findJoinCode('c1', 'u1')).resolves.toEqual({
        challengeId: 'c1',
        joinCode: 'ABCD2345',
      });
    });

    // O id do desafio é público (aparece no perfil de qualquer participante),
    // então esta rota é o que impede alguém de ler os desafios de outra
    // pessoa pelo perfil e entrar em todos eles.
    it('throws ForbiddenException for someone who does not participate', async () => {
      challengeFindUnique.mockResolvedValue({ id: 'c1', joinCode: 'ABCD2345' });
      participantFindUnique.mockResolvedValue(null);

      await expect(service.findJoinCode('c1', 'u9')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the challenge does not exist', async () => {
      challengeFindUnique.mockResolvedValue(null);

      await expect(service.findJoinCode('c1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('leave', () => {
    // Regra do CLAUDE.md seção 2: sair marca o vínculo como inativo e NUNCA
    // apaga nada — histórico, pontos e streaks continuam consultáveis.
    it('deactivates the participation without deleting anything', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', status: ParticipantStatus.active });
      participantUpdate.mockResolvedValue({ id: 'p1', status: ParticipantStatus.inactive });

      await service.leave('c1', 'u1');

      expect(participantUpdate).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ParticipantStatus.inactive },
      });
    });

    it('throws NotFoundException when the user does not participate', async () => {
      participantFindUnique.mockResolvedValue(null);

      await expect(service.leave('c1', 'u1')).rejects.toThrow(NotFoundException);
      expect(participantUpdate).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the user already left', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', status: ParticipantStatus.inactive });

      await expect(service.leave('c1', 'u1')).rejects.toThrow(ConflictException);
      expect(participantUpdate).not.toHaveBeenCalled();
    });
  });

  describe('previewByJoinCode', () => {
    it('normalizes the code and returns only what the invite page needs', async () => {
      challengeFindUnique.mockResolvedValue({
        name: 'Verão 2026',
        description: null,
        durationDays: 30,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
      });
      participantCount.mockResolvedValue(4);

      const result = await service.previewByJoinCode('  abcd2345 ');

      expect(challengeFindUnique).toHaveBeenCalledWith({
        where: { joinCode: 'ABCD2345' },
        select: { name: true, description: true, durationDays: true, startDate: true, endDate: true },
      });
      expect(result).toMatchObject({ name: 'Verão 2026', participantCount: 4 });
      // Rota pública: nunca vaza o id do desafio nem o próprio código.
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('joinCode');
    });

    it('counts only active participants', async () => {
      challengeFindUnique.mockResolvedValue({
        name: 'X',
        description: null,
        durationDays: 30,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
      });
      participantCount.mockResolvedValue(1);

      await service.previewByJoinCode('ABCD2345');

      expect(participantCount).toHaveBeenCalledWith({
        where: { challenge: { joinCode: 'ABCD2345' }, status: ParticipantStatus.active },
      });
    });

    it('throws NotFoundException for an unknown code', async () => {
      challengeFindUnique.mockResolvedValue(null);

      await expect(service.previewByJoinCode('ZZZZ9999')).rejects.toThrow(NotFoundException);
      expect(participantCount).not.toHaveBeenCalled();
    });
  });
});
