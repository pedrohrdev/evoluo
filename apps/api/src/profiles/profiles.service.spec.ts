import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let participantFindMany: jest.Mock;
  let dailyRecordGroupBy: jest.Mock;
  let findAllForParticipants: jest.Mock;
  let storageUpload: jest.Mock;
  let storageGetPublicUrl: jest.Mock;
  let prisma: PrismaService;
  let goalsService: GoalsService;
  let supabase: SupabaseService;
  let service: ProfilesService;

  beforeEach(() => {
    findUnique = jest.fn();
    update = jest.fn();
    participantFindMany = jest.fn();
    dailyRecordGroupBy = jest.fn().mockResolvedValue([]);
    findAllForParticipants = jest.fn().mockResolvedValue(new Map());
    storageUpload = jest.fn().mockResolvedValue({ error: null });
    storageGetPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.test/avatars/u1/avatar.jpg' } });
    prisma = {
      profile: { findUnique, update },
      challengeParticipant: { findMany: participantFindMany },
      dailyRecord: { groupBy: dailyRecordGroupBy },
    } as unknown as PrismaService;
    goalsService = { findAllForParticipants } as unknown as GoalsService;
    supabase = {
      adminClient: {
        storage: {
          from: jest.fn().mockReturnValue({ upload: storageUpload, getPublicUrl: storageGetPublicUrl }),
        },
      },
    } as unknown as SupabaseService;
    service = new ProfilesService(prisma, goalsService, supabase);
  });

  describe('findById', () => {
    it('returns the profile when found', async () => {
      const profile = { id: 'u1', displayName: 'Ana' };
      findUnique.mockResolvedValue(profile);

      await expect(service.findById('u1')).resolves.toEqual(profile);
      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });

    it('throws NotFoundException when missing', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicProfile', () => {
    it('returns the profile plus each participation with its aggregates and goals, no day-by-day history', async () => {
      const profile = { id: 'u1', displayName: 'Ana' };
      findUnique.mockResolvedValue(profile);
      const participants = [
        {
          id: 'p1',
          status: 'active',
          joinedAt: new Date('2026-01-05'),
          leftAt: null,
          currentStreak: 4,
          longestStreak: 9,
          totalPoints: 220,
          totalDaysCompleted: 4,
          challenge: {
            id: 'c1',
            name: 'Desafio 30 dias',
            durationDays: 30,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-01-30'),
          },
        },
      ];
      participantFindMany.mockResolvedValue(participants);
      const goals = [{ id: 'g1', periodType: 'daily' }];
      findAllForParticipants.mockResolvedValue(new Map([['p1', goals]]));

      const result = await service.getPublicProfile('u1');

      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
      expect(participantFindMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        include: {
          challenge: {
            select: { id: true, name: true, durationDays: true, startDate: true, endDate: true },
          },
        },
        orderBy: { joinedAt: 'desc' },
      });
      // Uma única chamada com todos os participantIds, nunca uma por
      // participação (etapa 18 "Performance").
      expect(findAllForParticipants).toHaveBeenCalledTimes(1);
      expect(findAllForParticipants).toHaveBeenCalledWith(['p1']);
      expect(result).toEqual({
        ...profile,
        challenges: [
          {
            challengeId: 'c1',
            challengeName: 'Desafio 30 dias',
            durationDays: 30,
            startDate: participants[0].challenge.startDate,
            endDate: participants[0].challenge.endDate,
            participantId: 'p1',
            status: 'active',
            joinedAt: participants[0].joinedAt,
            leftAt: null,
            currentStreak: 4,
            longestStreak: 9,
            totalPoints: 220,
            totalDaysCompleted: 4,
            lastCheckInDate: null,
            goals,
          },
        ],
      });
    });

    it('includes the last daily check-in date per participation, from a single groupBy aggregation', async () => {
      findUnique.mockResolvedValue({ id: 'u1' });
      participantFindMany.mockResolvedValue([
        {
          id: 'p1',
          status: 'active',
          joinedAt: new Date('2026-01-05'),
          leftAt: null,
          currentStreak: 4,
          longestStreak: 9,
          totalPoints: 220,
          totalDaysCompleted: 4,
          challenge: { id: 'c1', name: 'Desafio A', durationDays: 30, startDate: new Date(), endDate: new Date() },
        },
        {
          id: 'p2',
          status: 'active',
          joinedAt: new Date('2026-01-01'),
          leftAt: null,
          currentStreak: 0,
          longestStreak: 2,
          totalPoints: 30,
          totalDaysCompleted: 1,
          challenge: { id: 'c2', name: 'Desafio B', durationDays: 30, startDate: new Date(), endDate: new Date() },
        },
      ]);
      dailyRecordGroupBy.mockResolvedValue([
        { challengeParticipantId: 'p1', _max: { recordDate: new Date('2026-03-10') } },
        { challengeParticipantId: 'p2', _max: { recordDate: new Date('2026-02-01') } },
      ]);

      const result = await service.getPublicProfile('u1');

      expect(dailyRecordGroupBy).toHaveBeenCalledWith({
        by: ['challengeParticipantId'],
        where: { challengeParticipantId: { in: ['p1', 'p2'] } },
        _max: { recordDate: true },
      });
      expect(result.challenges.find((c) => c.participantId === 'p1')?.lastCheckInDate).toEqual(new Date('2026-03-10'));
      expect(result.challenges.find((c) => c.participantId === 'p2')?.lastCheckInDate).toEqual(new Date('2026-02-01'));
    });

    it('skips the groupBy call when there are no participations', async () => {
      findUnique.mockResolvedValue({ id: 'u1' });
      participantFindMany.mockResolvedValue([]);

      const result = await service.getPublicProfile('u1');

      expect(dailyRecordGroupBy).not.toHaveBeenCalled();
      expect(result.challenges).toEqual([]);
    });

    it('includes inactive participations too, since leaving a challenge does not erase the profile history', async () => {
      findUnique.mockResolvedValue({ id: 'u1' });
      participantFindMany.mockResolvedValue([
        {
          id: 'p1',
          status: 'inactive',
          joinedAt: new Date('2026-01-05'),
          leftAt: new Date('2026-01-20'),
          currentStreak: 0,
          longestStreak: 6,
          totalPoints: 100,
          totalDaysCompleted: 6,
          challenge: { id: 'c1', name: 'Desafio', durationDays: 30, startDate: new Date(), endDate: new Date() },
        },
      ]);

      const result = await service.getPublicProfile('u1');

      expect(result.challenges).toHaveLength(1);
      expect(result.challenges[0].status).toBe('inactive');
    });

    it('throws NotFoundException when the profile does not exist', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.getPublicProfile('missing')).rejects.toThrow(NotFoundException);
      expect(participantFindMany).not.toHaveBeenCalled();
    });
  });

  describe('updateOwn', () => {
    it('checks ownership before updating and bumps updatedAt', async () => {
      findUnique.mockResolvedValue({ id: 'u1' });
      update.mockResolvedValue({ id: 'u1', displayName: 'Nova Ana' });

      await service.updateOwn('u1', { displayName: 'Nova Ana' });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({ displayName: 'Nova Ana', updatedAt: expect.any(Date) }),
      });
    });

    it('does not send fields that were not provided', async () => {
      findUnique.mockResolvedValue({ id: 'u1' });
      update.mockResolvedValue({ id: 'u1' });

      await service.updateOwn('u1', {});

      const data = update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('displayName');
      expect(data).not.toHaveProperty('avatarUrl');
    });

    it('propagates NotFoundException for a non-existent profile', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.updateOwn('missing', { displayName: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('uploadAvatar', () => {
    const file = { buffer: Buffer.from('fake-image'), mimetype: 'image/jpeg' };

    it('uploads to the fixed per-user path and saves the public URL with a cache-busting param', async () => {
      findUnique.mockResolvedValue({ id: 'u1' });
      update.mockResolvedValue({ id: 'u1', avatarUrl: 'https://cdn.test/avatars/u1/avatar.jpg?v=1' });

      await service.uploadAvatar('u1', file);

      expect(storageUpload).toHaveBeenCalledWith('u1/avatar.jpg', file.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      const data = update.mock.calls[0][0].data;
      expect(data.avatarUrl).toMatch(/^https:\/\/cdn\.test\/avatars\/u1\/avatar\.jpg\?v=\d+$/);
    });

    it('rejects an unsupported mime type before touching storage', async () => {
      findUnique.mockResolvedValue({ id: 'u1' });

      await expect(service.uploadAvatar('u1', { buffer: Buffer.from(''), mimetype: 'application/pdf' })).rejects.toThrow(
        BadRequestException,
      );
      expect(storageUpload).not.toHaveBeenCalled();
    });

    it('translates a storage upload error into BadRequestException', async () => {
      findUnique.mockResolvedValue({ id: 'u1' });
      storageUpload.mockResolvedValue({ error: { message: 'bucket indisponível' } });

      await expect(service.uploadAvatar('u1', file)).rejects.toThrow(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException for a non-existent profile', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.uploadAvatar('missing', file)).rejects.toThrow(NotFoundException);
      expect(storageUpload).not.toHaveBeenCalled();
    });
  });
});
