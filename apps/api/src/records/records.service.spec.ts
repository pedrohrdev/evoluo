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
  let weeklyRecordFindMany: jest.Mock;
  let monthlyRecordUpsert: jest.Mock;
  let monthlyRecordFindMany: jest.Mock;
  let challengeRecordUpsert: jest.Mock;
  let challengeRecordFindMany: jest.Mock;
  let participantFindUnique: jest.Mock;
  let dayResultFindMany: jest.Mock;
  let dayResultFindUnique: jest.Mock;
  let txDailyRecordUpsert: jest.Mock;
  let executeRaw: jest.Mock;
  let transactionMock: jest.Mock;
  let prisma: PrismaService;
  let service: RecordsService;

  // endDate bem no futuro: os testes abaixo exercitam o caminho feliz, em
  // que o desafio está dentro da janela. A borda de fim tem testes próprios
  // ("já terminou").
  const activeParticipant = {
    id: 'p1',
    userId: 'u1',
    status: ParticipantStatus.active,
    challenge: { startDate: new Date('2020-01-01'), endDate: new Date('2999-12-31') },
  };
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
    weeklyRecordFindMany = jest.fn();
    monthlyRecordUpsert = jest.fn();
    monthlyRecordFindMany = jest.fn();
    challengeRecordUpsert = jest.fn();
    challengeRecordFindMany = jest.fn();
    participantFindUnique = jest.fn();
    dayResultFindMany = jest.fn();
    dayResultFindUnique = jest.fn();
    txDailyRecordUpsert = jest.fn();
    executeRaw = jest.fn();
    transactionMock = jest.fn((cb: (tx: unknown) => unknown) =>
      cb({ dailyRecord: { upsert: txDailyRecordUpsert }, $executeRaw: executeRaw }),
    );

    prisma = {
      goal: { findUnique: goalFindUnique },
      dailyRecord: { upsert: dailyRecordUpsert, findMany: dailyRecordFindMany },
      weeklyRecord: { upsert: weeklyRecordUpsert, findMany: weeklyRecordFindMany },
      monthlyRecord: { upsert: monthlyRecordUpsert, findMany: monthlyRecordFindMany },
      challengeRecord: { upsert: challengeRecordUpsert, findMany: challengeRecordFindMany },
      challengeParticipant: { findUnique: participantFindUnique },
      dayResult: { findMany: dayResultFindMany, findUnique: dayResultFindUnique },
      $transaction: transactionMock,
    } as unknown as PrismaService;

    service = new RecordsService(prisma);
  });

  // checkInDaily substituiu recordToday (etapa original) depois da mudança
  // de regra confirmada com o usuário: registro diário deixou de ser
  // upsert livre até a virada do dia e passou a ser um único envio por dia
  // ("check-in"), que já fecha o dia (streak/pontos) na hora — ver
  // CLAUDE.md seção "Streak" e docs/database-schema.md.
  describe('checkInDaily', () => {
    const dailyGoal = {
      id: 'g1',
      periodType: GoalPeriod.daily,
      challengeParticipantId: 'p1',
      challengeParticipant: activeParticipant,
      versions: [openHoursVersion],
    };
    const booleanGoal = {
      id: 'g2',
      periodType: GoalPeriod.daily,
      challengeParticipantId: 'p1',
      challengeParticipant: activeParticipant,
      versions: [openBooleanVersion],
    };

    beforeEach(() => {
      participantFindUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        status: ParticipantStatus.active,
        challenge: { startDate: new Date('2020-01-01'), endDate: new Date('2999-12-31') },
      });
      dayResultFindUnique.mockResolvedValue(null);
      dailyRecordFindMany.mockResolvedValue([]);
      weeklyRecordFindMany.mockResolvedValue([]);
      monthlyRecordFindMany.mockResolvedValue([]);
      challengeRecordFindMany.mockResolvedValue([]);
    });

    it('upserts every provided daily record inside the transaction, then closes today via check_in_daily_period', async () => {
      goalFindUnique.mockImplementation((args: { where: { id: string } }) =>
        Promise.resolve(args.where.id === 'g1' ? dailyGoal : booleanGoal),
      );

      await service.checkInDaily('p1', 'u1', {
        records: [
          { goalId: 'g1', actualValue: 1.5 },
          { goalId: 'g2', actualBoolean: true },
        ],
      });

      const today = new Date(todayInSaoPaulo());
      expect(txDailyRecordUpsert).toHaveBeenCalledTimes(2);
      expect(txDailyRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { goalId_recordDate: { goalId: 'g1', recordDate: today } },
          create: expect.objectContaining({ actualValue: 1.5, actualBoolean: undefined, kind: GoalKind.hours }),
        }),
      );
      expect(txDailyRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { goalId_recordDate: { goalId: 'g2', recordDate: today } },
          create: expect.objectContaining({ actualBoolean: true, actualValue: undefined, kind: GoalKind.boolean }),
        }),
      );
      // A transação só fecha o dia depois de gravar os registros — chamada
      // sempre por último, dentro do mesmo $transaction (atomicidade).
      expect(executeRaw).toHaveBeenCalledTimes(1);
    });

    it('returns the fresh today state after checking in', async () => {
      goalFindUnique.mockResolvedValue(dailyGoal);
      const dailyRows = [{ id: 'dr1' }];
      dailyRecordFindMany.mockResolvedValue(dailyRows);

      const result = await service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g1', actualValue: 1.5 }] });

      expect(result).toEqual({ daily: dailyRows, weekly: [], monthly: [], challenge: [] });
    });

    it('allows an empty records array — check-in com nada preenchido ainda fecha hoje como 0/3', async () => {
      await service.checkInDaily('p1', 'u1', { records: [] });

      expect(txDailyRecordUpsert).not.toHaveBeenCalled();
      expect(executeRaw).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when today was already checked in', async () => {
      dayResultFindUnique.mockResolvedValue({ closed: true });

      await expect(
        service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g1', actualValue: 1 }] }),
      ).rejects.toThrow(ConflictException);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the participant does not exist', async () => {
      participantFindUnique.mockResolvedValue(null);

      await expect(service.checkInDaily('missing', 'u1', { records: [] })).rejects.toThrow(NotFoundException);
      expect(dayResultFindUnique).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the participant belongs to another user', async () => {
      participantFindUnique.mockResolvedValue({
        id: 'p1',
        userId: 'someone-else',
        status: ParticipantStatus.active,
        challenge: { startDate: new Date('2020-01-01'), endDate: new Date('2999-12-31') },
      });

      await expect(service.checkInDaily('p1', 'u1', { records: [] })).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when the participant already left the challenge', async () => {
      participantFindUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        status: ParticipantStatus.inactive,
        challenge: { startDate: new Date('2020-01-01'), endDate: new Date('2999-12-31') },
      });

      await expect(service.checkInDaily('p1', 'u1', { records: [] })).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when the challenge is scheduled to start in the future', async () => {
      const tomorrow = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      participantFindUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        status: ParticipantStatus.active,
        challenge: { startDate: tomorrow, endDate: new Date('2999-12-31') },
      });

      await expect(service.checkInDaily('p1', 'u1', { records: [] })).rejects.toThrow(ForbiddenException);
      expect(dayResultFindUnique).not.toHaveBeenCalled();
    });

    // Etapa 23: a duração do desafio é fixa (CLAUDE.md seção 1) e nada
    // verificava a ponta de fim. Sem isto, o check-in continuava creditando
    // pontos e subindo streak depois do último dia — enquanto
    // close_daily_period, que filtra por `p_date <= c.end_date`, já tinha
    // parado de fechar os dias de quem NÃO fazia check-in.
    it('throws ForbiddenException when the challenge has already ended', async () => {
      const yesterday = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      participantFindUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        status: ParticipantStatus.active,
        challenge: { startDate: new Date('2020-01-01'), endDate: yesterday },
      });

      await expect(service.checkInDaily('p1', 'u1', { records: [] })).rejects.toThrow(ForbiddenException);
      expect(dayResultFindUnique).not.toHaveBeenCalled();
    });

    it('allows the check-in on the very last day of the challenge', async () => {
      const today = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
      participantFindUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        status: ParticipantStatus.active,
        challenge: { startDate: new Date('2020-01-01'), endDate: today },
      });
      dayResultFindUnique.mockResolvedValue(null);
      dailyRecordFindMany.mockResolvedValue([]);
      weeklyRecordFindMany.mockResolvedValue([]);
      monthlyRecordFindMany.mockResolvedValue([]);
      challengeRecordFindMany.mockResolvedValue([]);

      await expect(service.checkInDaily('p1', 'u1', { records: [] })).resolves.toBeDefined();
      expect(executeRaw).toHaveBeenCalled();
    });

    it('throws ForbiddenException when a goal in the payload belongs to a different participant', async () => {
      goalFindUnique.mockResolvedValue({ ...dailyGoal, challengeParticipantId: 'p2' });

      await expect(
        service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g1', actualValue: 1 }] }),
      ).rejects.toThrow(ForbiddenException);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a goal in the payload is not daily', async () => {
      goalFindUnique.mockResolvedValue({ ...dailyGoal, periodType: GoalPeriod.weekly });

      await expect(
        service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g1', actualValue: 1 }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a goal in the payload has no open version', async () => {
      goalFindUnique.mockResolvedValue({ ...dailyGoal, versions: [] });

      await expect(
        service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g1', actualValue: 1 }] }),
      ).rejects.toThrow(ConflictException);
    });

    describe('actual value/kind mismatches', () => {
      it('rejects a boolean goal recorded without actualBoolean', async () => {
        goalFindUnique.mockResolvedValue(booleanGoal);

        await expect(service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g2' }] })).rejects.toThrow(
          BadRequestException,
        );
      });

      it('rejects a boolean goal recorded with actualValue', async () => {
        goalFindUnique.mockResolvedValue(booleanGoal);

        await expect(
          service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g2', actualBoolean: true, actualValue: 1 }] }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects an hours goal recorded without actualValue', async () => {
        goalFindUnique.mockResolvedValue(dailyGoal);

        await expect(service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g1' }] })).rejects.toThrow(
          BadRequestException,
        );
      });

      it('rejects an hours goal recorded with actualBoolean', async () => {
        goalFindUnique.mockResolvedValue(dailyGoal);

        await expect(
          service.checkInDaily('p1', 'u1', { records: [{ goalId: 'g1', actualValue: 1, actualBoolean: true }] }),
        ).rejects.toThrow(BadRequestException);
      });
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

    // Um desafio pode ser criado com start_date no futuro (ex.: combinado
    // pra começar numa segunda-feira específica) — nada é registrável antes
    // disso, nem metas semanais/mensais/de duração (resolveOpenGoalVersion
    // é compartilhado por todos os períodos, então testar aqui cobre os
    // outros também).
    it('throws ForbiddenException when the challenge is scheduled to start in the future', async () => {
      const tomorrow = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.weekly,
        challengeParticipant: { ...activeParticipant, challenge: { startDate: tomorrow, endDate: new Date('2999-12-31') } },
        versions: [openHoursVersion],
      });

      await expect(service.recordCurrentWeek('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ForbiddenException);
      expect(weeklyRecordUpsert).not.toHaveBeenCalled();
    });

    // Mesma regra para metas de período: a janela do registro é a semana/mês
    // civil, que não tem relação nenhuma com o fim do desafio — então a
    // checagem precisa existir aqui também, não só nos triggers do banco.
    it('throws ForbiddenException when the challenge has already ended', async () => {
      const yesterday = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      goalFindUnique.mockResolvedValue({
        id: 'g1',
        periodType: GoalPeriod.weekly,
        challengeParticipant: {
          ...activeParticipant,
          challenge: { startDate: new Date('2020-01-01'), endDate: yesterday },
        },
        versions: [openHoursVersion],
      });

      await expect(service.recordCurrentWeek('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ForbiddenException);
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
          challenge: { startDate: activeParticipant.challenge.startDate, endDate: challengeEndDate },
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
        challengeParticipant: { ...activeParticipant, joinedAt, challenge: { startDate: activeParticipant.challenge.startDate, endDate: challengeEndDate } },
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
        challengeParticipant: { ...activeParticipant, joinedAt, challenge: { startDate: activeParticipant.challenge.startDate, endDate: challengeEndDate } },
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

  describe('getTodayState', () => {
    it('reads the still-open period for each table, without any new computation', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1' });
      const dailyRows = [{ id: 'dr1' }];
      const weeklyRows = [{ id: 'wr1' }];
      const monthlyRows = [{ id: 'mr1' }];
      const challengeRows = [{ id: 'cr1' }];
      dailyRecordFindMany.mockResolvedValue(dailyRows);
      weeklyRecordFindMany.mockResolvedValue(weeklyRows);
      monthlyRecordFindMany.mockResolvedValue(monthlyRows);
      challengeRecordFindMany.mockResolvedValue(challengeRows);

      const result = await service.getTodayState('p1');

      const today = new Date(todayInSaoPaulo());
      const { periodStart: weekStart } = currentWeekRangeInSaoPaulo();
      const { periodStart: monthStart } = currentMonthRangeInSaoPaulo();

      expect(dailyRecordFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1', recordDate: today },
      });
      expect(weeklyRecordFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1', periodStart: new Date(weekStart) },
      });
      expect(monthlyRecordFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1', periodStart: new Date(monthStart) },
      });
      expect(challengeRecordFindMany).toHaveBeenCalledWith({ where: { challengeParticipantId: 'p1' } });

      expect(result).toEqual({ daily: dailyRows, weekly: weeklyRows, monthly: monthlyRows, challenge: challengeRows });
    });

    it('throws NotFoundException when the participant does not exist', async () => {
      participantFindUnique.mockResolvedValue(null);

      await expect(service.getTodayState('missing')).rejects.toThrow(NotFoundException);
      expect(dailyRecordFindMany).not.toHaveBeenCalled();
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
      // goalVersion é achatado em `title` pelo service — ver getHistory.
      const recordDay1 = { id: 'r1', recordDate: day1, completed: true, pointsAwarded: 30 };
      dailyRecordFindMany.mockResolvedValue([{ ...recordDay1, goalVersion: { title: 'Ler 30 páginas' } }]);

      const result = await service.getHistory('p1');

      expect(dayResultFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1', closed: true },
        orderBy: { resultDate: 'desc' },
      });
      expect(dailyRecordFindMany).toHaveBeenCalledWith({
        where: { challengeParticipantId: 'p1', recordDate: { in: [day1, day2] } },
        orderBy: { recordDate: 'desc' },
        include: { goalVersion: { select: { title: true } } },
      });
      expect(result).toEqual([
        {
          date: day1,
          completedGoalsCount: 3,
          dayCompleted: true,
          streakAfter: 2,
          records: [{ ...recordDay1, title: 'Ler 30 páginas' }],
        },
        { date: day2, completedGoalsCount: 1, dayCompleted: false, streakAfter: 0, records: [] },
      ]);
    });

    // A promessa do CLAUDE.md seção "Histórico": editar a meta não altera
    // registro já gravado. O título vem da VERSÃO referenciada pelo
    // registro, não da versão vigente da meta.
    it('reports the goal title as it was at record time, not the current one', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1' });
      const day = new Date('2026-01-02');
      dayResultFindMany.mockResolvedValue([
        { resultDate: day, completedGoalsCount: 1, dayCompleted: false, streakAfter: 0 },
      ]);
      dailyRecordFindMany.mockResolvedValue([
        { id: 'r1', recordDate: day, completed: true, pointsAwarded: 30, goalVersion: { title: 'Ler 30 páginas' } },
      ]);

      const result = await service.getHistory('p1');

      expect(result[0].records[0]).toMatchObject({ title: 'Ler 30 páginas' });
      expect(result[0].records[0]).not.toHaveProperty('goalVersion');
    });

    it('groups every record of the same day together (a real day has all 3 mandatory daily goals)', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1' });
      const day1 = new Date('2026-01-02');
      dayResultFindMany.mockResolvedValue([
        { resultDate: day1, completedGoalsCount: 3, dayCompleted: true, streakAfter: 5 },
      ]);
      const recordA = { id: 'r1', recordDate: day1, completed: true, pointsAwarded: 30, title: 'A' };
      const recordB = { id: 'r2', recordDate: day1, completed: true, pointsAwarded: 20, title: 'B' };
      const recordC = { id: 'r3', recordDate: day1, completed: true, pointsAwarded: 10, title: 'C' };
      dailyRecordFindMany.mockResolvedValue(
        [recordA, recordB, recordC].map(({ title, ...rest }) => ({ ...rest, goalVersion: { title } })),
      );

      const result = await service.getHistory('p1');

      expect(result).toEqual([
        { date: day1, completedGoalsCount: 3, dayCompleted: true, streakAfter: 5, records: [recordA, recordB, recordC] },
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
