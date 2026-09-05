import { NotFoundException } from '@nestjs/common';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let participantFindMany: jest.Mock;
  let findAllForParticipant: jest.Mock;
  let prisma: PrismaService;
  let goalsService: GoalsService;
  let service: ProfilesService;

  beforeEach(() => {
    findUnique = jest.fn();
    update = jest.fn();
    participantFindMany = jest.fn();
    findAllForParticipant = jest.fn();
    prisma = {
      profile: { findUnique, update },
      challengeParticipant: { findMany: participantFindMany },
    } as unknown as PrismaService;
    goalsService = { findAllForParticipant } as unknown as GoalsService;
    service = new ProfilesService(prisma, goalsService);
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
      findAllForParticipant.mockResolvedValue(goals);

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
      expect(findAllForParticipant).toHaveBeenCalledWith('p1');
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
            goals,
          },
        ],
      });
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
      findAllForParticipant.mockResolvedValue([]);

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
});
