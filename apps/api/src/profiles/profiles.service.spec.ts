import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let prisma: PrismaService;
  let service: ProfilesService;

  beforeEach(() => {
    findUnique = jest.fn();
    update = jest.fn();
    prisma = { profile: { findUnique, update } } as unknown as PrismaService;
    service = new ProfilesService(prisma);
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
