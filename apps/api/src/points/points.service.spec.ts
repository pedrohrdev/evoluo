import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from './points.service';

describe('PointsService', () => {
  let pointsConfigFindMany: jest.Mock;
  let participantFindUnique: jest.Mock;
  let pointsLedgerFindMany: jest.Mock;
  let prisma: PrismaService;
  let service: PointsService;

  beforeEach(() => {
    pointsConfigFindMany = jest.fn();
    participantFindUnique = jest.fn();
    pointsLedgerFindMany = jest.fn();

    prisma = {
      pointsConfig: { findMany: pointsConfigFindMany },
      challengeParticipant: { findUnique: participantFindUnique },
      pointsLedger: { findMany: pointsLedgerFindMany },
    } as unknown as PrismaService;

    service = new PointsService(prisma);
  });

  describe('getConfig', () => {
    it('returns the points_config rows ordered by period and importance, without recalculating anything', async () => {
      const rows = [{ importance: 'high', periodType: 'daily', points: 30 }];
      pointsConfigFindMany.mockResolvedValue(rows);

      await expect(service.getConfig()).resolves.toEqual(rows);
      expect(pointsConfigFindMany).toHaveBeenCalledWith({
        orderBy: [{ periodType: 'asc' }, { importance: 'asc' }],
      });
    });
  });

  describe('getParticipantPoints', () => {
    it('returns totalPoints already stored plus the full ledger, without summing it itself', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', totalPoints: 150 });
      const ledger = [{ id: 'l1', points: 30, sourceTable: 'daily_records' }];
      pointsLedgerFindMany.mockResolvedValue(ledger);

      const result = await service.getParticipantPoints('p1');

      expect(participantFindUnique).toHaveBeenCalledWith({
        where: { id: 'p1' },
        select: { id: true, totalPoints: true },
      });
      expect(pointsLedgerFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1' },
        orderBy: { awardedForDate: 'desc' },
      });
      expect(result).toEqual({ participantId: 'p1', totalPoints: 150, ledger });
    });

    it('throws NotFoundException when the participant does not exist', async () => {
      participantFindUnique.mockResolvedValue(null);

      await expect(service.getParticipantPoints('missing')).rejects.toThrow(NotFoundException);
      expect(pointsLedgerFindMany).not.toHaveBeenCalled();
    });
  });
});
