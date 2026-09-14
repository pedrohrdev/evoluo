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

    prisma = {
      goal: { findUnique: goalFindUnique },
      dailyRecord: { upsert: dailyRecordUpsert, findMany: dailyRecordFindMany },
      weeklyRecord: { upsert: weeklyRecordUpsert, findMany: weeklyRecordFindMany },
      monthlyRecord: { upsert: monthlyRecordUpsert, findMany: monthlyRecordFindMany },
      challengeRecord: { upsert: challengeRecordUpsert, findMany: challengeRecordFindMany },
      challengeParticipant: { findUnique: participantFindUnique },
      dayResult: { findMany: dayResultFindMany },
    } as unknown as PrismaService;

    service = new RecordsService(prisma);
  });

  // recordCurrentDaily substituiu checkInDaily depois da mudança de regra
  // confirmada com o usuário: o check-in único por dia foi revertido — cada
  // meta diária volta a ser um upsert avulso por goalId, sempre para hoje,
  // no mesmo padrão de recordCurrentWeek/Month/Challenge abaixo. Streak e
  // pontos reagem em tempo real no banco (trigger reconcile_daily_period,
  // supabase/migrations/20260914090000) — não há nada disso para testar
  // aqui, que só verifica a query montada (ver scoring-and-streak.int-spec.ts
  // para a lógica reativa de verdade, rodando contra Postgres).
  describe('recordCurrentDaily', () => {
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

    it('upserts a daily record keyed by today', async () => {
      goalFindUnique.mockResolvedValue(dailyGoal);
      dailyRecordUpsert.mockResolvedValue({ id: 'dr1', completed: true, pointsAwarded: 30 });

      const result = await service.recordCurrentDaily('g1', 'u1', { actualValue: 1.5 });

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
      expect(result).toEqual({ id: 'dr1', completed: true, pointsAwarded: 30 });
    });

    it('upserts a boolean daily record', async () => {
      goalFindUnique.mockResolvedValue(booleanGoal);
      dailyRecordUpsert.mockResolvedValue({ id: 'dr2' });

      await service.recordCurrentDaily('g2', 'u1', { actualBoolean: true });

      expect(dailyRecordUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ actualBoolean: true, actualValue: undefined, kind: GoalKind.boolean }),
        }),
      );
    });

    it('throws NotFoundException when the goal does not exist', async () => {
      goalFindUnique.mockResolvedValue(null);

      await expect(service.recordCurrentDaily('missing', 'u1', { actualValue: 1 })).rejects.toThrow(
        NotFoundException,
      );
      expect(dailyRecordUpsert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the goal belongs to another user', async () => {
      goalFindUnique.mockResolvedValue({
        ...dailyGoal,
        challengeParticipant: { ...activeParticipant, userId: 'someone-else' },
      });

      await expect(service.recordCurrentDaily('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when the participant already left the challenge', async () => {
      goalFindUnique.mockResolvedValue({
        ...dailyGoal,
        challengeParticipant: { ...activeParticipant, status: ParticipantStatus.inactive },
      });

      await expect(service.recordCurrentDaily('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when the challenge is scheduled to start in the future', async () => {
      const tomorrow = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      goalFindUnique.mockResolvedValue({
        ...dailyGoal,
        challengeParticipant: { ...activeParticipant, challenge: { startDate: tomorrow, endDate: new Date('2999-12-31') } },
      });

      await expect(service.recordCurrentDaily('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ForbiddenException);
      expect(dailyRecordUpsert).not.toHaveBeenCalled();
    });

    // Etapa 23: a duração do desafio é fixa (CLAUDE.md seção 1). Sem isto,
    // o registro diário continuaria creditando pontos e subindo streak
    // depois do último dia.
    it('throws ForbiddenException when the challenge has already ended', async () => {
      const yesterday = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      goalFindUnique.mockResolvedValue({
        ...dailyGoal,
        challengeParticipant: { ...activeParticipant, challenge: { startDate: new Date('2020-01-01'), endDate: yesterday } },
      });

      await expect(service.recordCurrentDaily('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ForbiddenException);
      expect(dailyRecordUpsert).not.toHaveBeenCalled();
    });

    it('allows recording on the very last day of the challenge', async () => {
      const today = new Date(`${todayInSaoPaulo()}T00:00:00Z`);
      goalFindUnique.mockResolvedValue({
        ...dailyGoal,
        challengeParticipant: { ...activeParticipant, challenge: { startDate: new Date('2020-01-01'), endDate: today } },
      });
      dailyRecordUpsert.mockResolvedValue({ id: 'dr1' });

      await expect(service.recordCurrentDaily('g1', 'u1', { actualValue: 1 })).resolves.toBeDefined();
    });

    it('throws BadRequestException when the goal is not daily', async () => {
      goalFindUnique.mockResolvedValue({ ...dailyGoal, periodType: GoalPeriod.weekly });

      await expect(service.recordCurrentDaily('g1', 'u1', { actualValue: 1 })).rejects.toThrow(BadRequestException);
      expect(dailyRecordUpsert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the goal has no open version', async () => {
      goalFindUnique.mockResolvedValue({ ...dailyGoal, versions: [] });

      await expect(service.recordCurrentDaily('g1', 'u1', { actualValue: 1 })).rejects.toThrow(ConflictException);
    });

    describe('actual value/kind mismatches', () => {
      it('rejects a boolean goal recorded without actualBoolean', async () => {
        goalFindUnique.mockResolvedValue(booleanGoal);

        await expect(service.recordCurrentDaily('g2', 'u1', {})).rejects.toThrow(BadRequestException);
      });

      it('rejects a boolean goal recorded with actualValue', async () => {
        goalFindUnique.mockResolvedValue(booleanGoal);

        await expect(
          service.recordCurrentDaily('g2', 'u1', { actualBoolean: true, actualValue: 1 }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects an hours goal recorded without actualValue', async () => {
        goalFindUnique.mockResolvedValue(dailyGoal);

        await expect(service.recordCurrentDaily('g1', 'u1', {})).rejects.toThrow(BadRequestException);
      });

      it('rejects an hours goal recorded with actualBoolean', async () => {
        goalFindUnique.mockResolvedValue(dailyGoal);

        await expect(
          service.recordCurrentDaily('g1', 'u1', { actualValue: 1, actualBoolean: true }),
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
    // startDate bem no passado: os testes abaixo exercitam dias dentro do
    // desafio. O corte por início tem teste próprio.
    const withChallenge = { id: 'p1', challenge: { startDate: new Date('2020-01-01') } };

    it('returns only closed days, each with its matching records, most recent first', async () => {
      participantFindUnique.mockResolvedValue(withChallenge);
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
        where: {
          challengeParticipantId: 'p1',
          closed: true,
          resultDate: { gte: new Date('2020-01-01') },
        },
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
      participantFindUnique.mockResolvedValue(withChallenge);
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
      participantFindUnique.mockResolvedValue(withChallenge);
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
      participantFindUnique.mockResolvedValue(withChallenge);
      dayResultFindMany.mockResolvedValue([]);

      await expect(service.getHistory('p1')).resolves.toEqual([]);
      expect(dailyRecordFindMany).not.toHaveBeenCalled();
    });

    // Um dia anterior ao início do desafio é impossível por definição — o
    // backend recusava check-in nessa data. Exibi-lo como "0/3, dia perdido"
    // mostra uma derrota que não podia acontecer. O job noturno chegou a
    // criar linhas assim antes da migration 20260912090000, e este filtro
    // cobre as que sobraram.
    it('never asks for days before the challenge started', async () => {
      participantFindUnique.mockResolvedValue({ id: 'p1', challenge: { startDate: new Date('2026-09-13') } });
      dayResultFindMany.mockResolvedValue([]);

      await service.getHistory('p1');

      expect(dayResultFindMany.mock.calls[0][0].where.resultDate).toEqual({ gte: new Date('2026-09-13') });
    });

    it('throws NotFoundException when the participant does not exist', async () => {
      participantFindUnique.mockResolvedValue(null);

      await expect(service.getHistory('missing')).rejects.toThrow(NotFoundException);
      expect(dayResultFindMany).not.toHaveBeenCalled();
    });
  });
});
