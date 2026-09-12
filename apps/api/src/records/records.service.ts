import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Goal, GoalKind, GoalPeriod, GoalVersion, ParticipantStatus, Prisma } from '@prisma/client';
import {
  currentMonthRangeInSaoPaulo,
  currentWeekRangeInSaoPaulo,
  toDateString,
  todayInSaoPaulo,
} from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';
import { CheckInDailyDto, CheckInDailyEntryDto } from './dto/check-in-daily.dto';
import { RecordDailyGoalDto } from './dto/record-daily-goal.dto';
import { RecordPeriodGoalDto } from './dto/record-period-goal.dto';

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  [GoalPeriod.daily]: 'diárias',
  [GoalPeriod.weekly]: 'semanais',
  [GoalPeriod.monthly]: 'mensais',
  [GoalPeriod.challenge]: 'de duração do desafio',
};

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  // Check-in único por dia (CLAUDE.md seção "Streak", regra revisada): o
  // participante envia de uma vez o que preencheu das metas diárias —
  // metas de fora do array ficam sem registro (0/3 automático). Rejeita se
  // o dia de hoje já foi fechado (por um check-in anterior, ou pelo job
  // noturno numa borda de fuso). Grava os registros e fecha o dia
  // atomicamente: se check_in_daily_period() falhar (ex.: corrida entre
  // duas chamadas), a transação desfaz também os daily_records recém-
  // gravados, nunca deixando um registro "órfão" sem o fechamento
  // correspondente.
  async checkInDaily(participantId: string, userId: string, dto: CheckInDailyDto) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        userId: true,
        status: true,
        challenge: { select: { startDate: true, endDate: true } },
      },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }
    if (participant.userId !== userId) {
      throw new ForbiddenException('Você não pode fazer o check-in de outro participante.');
    }
    if (participant.status !== ParticipantStatus.active) {
      throw new ForbiddenException('Não é possível fazer check-in de um desafio que você já deixou.');
    }
    this.assertChallengeWindow(participant.challenge);

    const today = new Date(todayInSaoPaulo());

    const existingToday = await this.prisma.dayResult.findUnique({
      where: { challengeParticipantId_resultDate: { challengeParticipantId: participantId, resultDate: today } },
      select: { closed: true },
    });

    if (existingToday?.closed) {
      throw new ConflictException('Você já fez seu check-in de hoje.');
    }

    const resolved = await Promise.all(
      dto.records.map(async (entry: CheckInDailyEntryDto) => {
        const { goal, currentVersion } = await this.resolveOpenGoalVersion(entry.goalId, userId, GoalPeriod.daily);

        if (goal.challengeParticipantId !== participantId) {
          throw new ForbiddenException('Você não pode registrar a meta de outro participante.');
        }

        this.assertActualMatchesKind(currentVersion.kind, entry);
        return { goal, currentVersion, entry };
      }),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const { goal, currentVersion, entry } of resolved) {
        await tx.dailyRecord.upsert({
          where: { goalId_recordDate: { goalId: entry.goalId, recordDate: today } },
          create: {
            goalId: entry.goalId,
            goalVersionId: currentVersion.id,
            challengeParticipantId: goal.challengeParticipantId,
            recordDate: today,
            actualValue: entry.actualValue,
            actualBoolean: entry.actualBoolean,
            // Placeholders coerentes com a versão vigente: os triggers
            // compute_daily_record_fields/enforce_daily_record_window do
            // banco recalculam kind/importance/targetValueSnapshot/
            // completed/pointsAwarded a partir do goal_version_id,
            // sobrescrevendo qualquer valor enviado aqui.
            kind: currentVersion.kind,
            importance: currentVersion.importance,
            targetValueSnapshot: currentVersion.targetValue,
          },
          update: {
            goalVersionId: currentVersion.id,
            actualValue: entry.actualValue ?? null,
            actualBoolean: entry.actualBoolean ?? null,
            kind: currentVersion.kind,
            importance: currentVersion.importance,
            targetValueSnapshot: currentVersion.targetValue,
          },
        });
      }

      // check_in_daily_period() decide streak, credita pontos e marca
      // day_results.closed = true para hoje — mesma lógica de
      // close_daily_period() (supabase/migrations/20260905090900), só que
      // instantânea e para um único participante (ver
      // supabase/migrations/20260906090000_instant_daily_checkin.sql).
      await tx.$executeRaw(Prisma.sql`select check_in_daily_period(${participantId}::uuid)`);
    });

    return this.getTodayState(participantId);
  }

  // Upsert por (goal_id, period_start) — para o período semanal vigente (segunda a
  // domingo, calendário civil — CLAUDE.md seção 2 "Metas"). O período nunca
  // vem do cliente: é sempre o que contém "hoje" em America/Sao_Paulo, o
  // que já impede edição retroativa por este caminho, e
  // enforce_period_record_window recusa qualquer tentativa fora dele
  // mesmo assim. Metas semanais nunca afetam streak.
  async recordCurrentWeek(goalId: string, userId: string, dto: RecordPeriodGoalDto) {
    const { goal, currentVersion } = await this.resolveOpenGoalVersion(goalId, userId, GoalPeriod.weekly);

    this.assertActualMatchesKind(currentVersion.kind, dto);

    const { periodStart, periodEnd } = currentWeekRangeInSaoPaulo();
    const start = new Date(periodStart);

    return this.prisma.weeklyRecord.upsert({
      where: { goalId_periodStart: { goalId, periodStart: start } },
      ...this.buildPeriodRecordData(goal, currentVersion, dto, start, new Date(periodEnd)),
    });
  }

  // Mesmo padrão de recordCurrentWeek, para o período mensal vigente (dia 1
  // ao último dia do mês, calendário civil).
  async recordCurrentMonth(goalId: string, userId: string, dto: RecordPeriodGoalDto) {
    const { goal, currentVersion } = await this.resolveOpenGoalVersion(goalId, userId, GoalPeriod.monthly);

    this.assertActualMatchesKind(currentVersion.kind, dto);

    const { periodStart, periodEnd } = currentMonthRangeInSaoPaulo();
    const start = new Date(periodStart);

    return this.prisma.monthlyRecord.upsert({
      where: { goalId_periodStart: { goalId, periodStart: start } },
      ...this.buildPeriodRecordData(goal, currentVersion, dto, start, new Date(periodEnd)),
    });
  }

  // Meta de duração: diferente de recordCurrentWeek/Month, o período não é
  // "o vigente agora" — é fixo por toda a meta: periodStart é a data de
  // entrada do participante (não o início do desafio) e periodEnd é o fim
  // do desafio. Isso implementa diretamente a regra de quem entra atrasado
  // (CLAUDE.md seção 2 "Metas": entrar no dia 10 de um desafio de 30 dias
  // gera uma meta de duração de 20 dias, não de 30) — inclusive reduzindo
  // para o caso trivial (0 dias de atraso) de quem entra no dia 1. Só o
  // período é recalculado; o target_value continua sendo o que o
  // participante configurou (GoalsService.create), sem nenhuma
  // proporcionalidade automática.
  async recordCurrentChallenge(goalId: string, userId: string, dto: RecordPeriodGoalDto) {
    const { goal, currentVersion } = await this.resolveOpenGoalVersion(goalId, userId, GoalPeriod.challenge);

    this.assertActualMatchesKind(currentVersion.kind, dto);

    const periodStartStr = todayInSaoPaulo(goal.challengeParticipant.joinedAt);
    // endDate é uma coluna `date` pura — nunca formatá-la com
    // todayInSaoPaulo, que aplicaria um fuso e deslocaria o dia.
    const periodEndStr = toDateString(goal.challengeParticipant.challenge.endDate);

    const start = new Date(periodStartStr);

    return this.prisma.challengeRecord.upsert({
      where: { goalId },
      ...this.buildPeriodRecordData(goal, currentVersion, dto, start, new Date(periodEndStr)),
    });
  }

  private buildPeriodRecordData(
    goal: Goal,
    currentVersion: GoalVersion,
    dto: RecordPeriodGoalDto,
    periodStart: Date,
    periodEnd: Date,
  ) {
    return {
      create: {
        goalId: goal.id,
        goalVersionId: currentVersion.id,
        challengeParticipantId: goal.challengeParticipantId,
        periodStart,
        periodEnd,
        actualValue: dto.actualValue,
        actualBoolean: dto.actualBoolean,
        // Placeholders coerentes com a versão vigente: os triggers
        // compute_period_record_fields/enforce_period_record_window do
        // banco recalculam/validam tudo a partir do goal_version_id.
        kind: currentVersion.kind,
        importance: currentVersion.importance,
        targetValueSnapshot: currentVersion.targetValue,
      },
      update: {
        goalVersionId: currentVersion.id,
        actualValue: dto.actualValue ?? null,
        actualBoolean: dto.actualBoolean ?? null,
        kind: currentVersion.kind,
        importance: currentVersion.importance,
        targetValueSnapshot: currentVersion.targetValue,
      },
    };
  }

  private async resolveOpenGoalVersion(goalId: string, userId: string, expectedPeriodType: GoalPeriod) {
    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        // Inclui o desafio para a meta de duração (período fixo = data de
        // entrada até o fim do desafio); um join a mais e inofensivo para
        // daily/weekly/monthly, que não usam goal.challengeParticipant.challenge.
        challengeParticipant: { include: { challenge: true } },
        versions: { where: { validUntil: null } },
      },
    });

    if (!goal) {
      throw new NotFoundException('Meta não encontrada.');
    }

    if (goal.challengeParticipant.userId !== userId) {
      throw new ForbiddenException('Você não pode registrar a meta de outro participante.');
    }

    if (goal.periodType !== expectedPeriodType) {
      throw new BadRequestException(`Este endpoint só registra metas ${PERIOD_LABELS[expectedPeriodType]}.`);
    }

    if (goal.challengeParticipant.status !== ParticipantStatus.active) {
      throw new ForbiddenException('Não é possível registrar metas de um desafio que você já deixou.');
    }

    this.assertChallengeWindow(goal.challengeParticipant.challenge);

    const currentVersion = goal.versions[0];
    if (!currentVersion) {
      throw new ConflictException('Esta meta não tem uma versão vigente configurada.');
    }

    return { goal, currentVersion };
  }

  // Estado do período ainda ABERTO de cada periodicidade (etapa 15 —
  // frontend precisa saber o que já foi registrado hoje/nesta semana/neste
  // mês/na meta de duração para não mostrar como "não registrado" algo que
  // já foi, ao recarregar a página). Só leitura direta das linhas já
  // existentes, mesmo padrão de StreakService.today — nenhum cálculo novo,
  // nenhuma regra de negócio adicional. Nunca inclui períodos fechados
  // (esses são histórico, GET .../daily-history).
  async getTodayState(participantId: string) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { id: participantId },
      select: { id: true },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }

    const { periodStart: weekStart } = currentWeekRangeInSaoPaulo();
    const { periodStart: monthStart } = currentMonthRangeInSaoPaulo();

    const [daily, weekly, monthly, challenge] = await Promise.all([
      this.prisma.dailyRecord.findMany({
        where: { challengeParticipantId: participantId, recordDate: new Date(todayInSaoPaulo()) },
      }),
      this.prisma.weeklyRecord.findMany({
        where: { challengeParticipantId: participantId, periodStart: new Date(weekStart) },
      }),
      this.prisma.monthlyRecord.findMany({
        where: { challengeParticipantId: participantId, periodStart: new Date(monthStart) },
      }),
      this.prisma.challengeRecord.findMany({ where: { challengeParticipantId: participantId } }),
    ]);

    return { daily, weekly, monthly, challenge };
  }

  // Histórico dia a dia (CLAUDE.md seção "Histórico" / IMPLEMENTATION_PLAN
  // etapa 11): só dias já FECHADOS por close_daily_period (day_results com
  // closed = true) — nunca "hoje", cujo estado tentativo já é exposto por
  // GET .../streak. Um dia fechado sem nenhum registro aparece com
  // completedGoalsCount 0 e records vazio (0/3 automático, CLAUDE.md seção
  // 2 "Cumprimento de metas"). Cada registro devolvido é o snapshot exato
  // gravado no momento (kind/importance/targetValueSnapshot), nunca a
  // configuração atual da meta — a mesma garantia de imutabilidade da
  // etapa 5, aqui só para leitura.
  async getHistory(participantId: string) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { id: participantId },
      select: { id: true },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }

    const dayResults = await this.prisma.dayResult.findMany({
      where: { challengeParticipantId: participantId, closed: true },
      orderBy: { resultDate: 'desc' },
    });

    if (dayResults.length === 0) {
      return [];
    }

    // Inclui o título da VERSÃO que o registro referencia, não o título
    // atual da meta.
    //
    // CLAUDE.md seção "Histórico" promete que alterações futuras em uma meta
    // (inclusive o título) não alteram retroativamente registros já
    // existentes — mas as tabelas de registro só guardam snapshot de
    // kind/importance/target_value, nunca do título. O frontend resolvia o
    // nome pela versão vigente, então renomear "Ler 30 páginas" para "Ler 5
    // páginas" reescrevia todo o histórico passado. O dado correto sempre
    // esteve em goal_versions, alcançável pela goal_version_id do registro.
    const records = await this.prisma.dailyRecord.findMany({
      where: {
        challengeParticipantId: participantId,
        recordDate: { in: dayResults.map((dayResult) => dayResult.resultDate) },
      },
      orderBy: { recordDate: 'desc' },
      include: { goalVersion: { select: { title: true } } },
    });

    const recordsByDate = new Map<number, typeof records>();
    for (const record of records) {
      const key = record.recordDate.getTime();
      const bucket = recordsByDate.get(key);
      if (bucket) {
        bucket.push(record);
      } else {
        recordsByDate.set(key, [record]);
      }
    }

    return dayResults.map((dayResult) => ({
      date: dayResult.resultDate,
      completedGoalsCount: dayResult.completedGoalsCount,
      dayCompleted: dayResult.dayCompleted,
      streakAfter: dayResult.streakAfter,
      records: (recordsByDate.get(dayResult.resultDate.getTime()) ?? []).map(({ goalVersion, ...record }) => ({
        ...record,
        // Achatado para o cliente não precisar conhecer goal_versions.
        title: goalVersion.title,
      })),
    }));
  }

  // A janela em que um desafio aceita escrita: de start_date a end_date,
  // inclusive, no fuso fixo America/Sao_Paulo.
  //
  // Os triggers do banco (enforce_daily_record_window,
  // enforce_period_record_window) só comparam a data do registro contra
  // "hoje" — não conhecem challenges.start_date nem end_date. Por isso as
  // duas pontas são checadas aqui.
  //
  // Início: um desafio pode ser criado para começar numa data futura (ex.:
  // criar na sexta, combinar de todo mundo começar na segunda) — antes
  // disso nada é registrável (CLAUDE.md seção 2).
  //
  // Fim: a duração é fixa (30/50/100/365 dias, CLAUDE.md seção 1), então o
  // desafio para de aceitar registro depois do último dia. Sem isto, o
  // check-in continuava creditando pontos e subindo streak indefinidamente
  // — enquanto close_daily_period (que filtra por `p_date <= c.end_date`)
  // já tinha parado de fechar os dias, deixando as duas regras divergindo.
  private assertChallengeWindow(challenge: { startDate: Date; endDate: Date }): void {
    const today = todayInSaoPaulo();

    if (today < toDateString(challenge.startDate)) {
      throw new ForbiddenException('Este desafio ainda não começou.');
    }

    if (today > toDateString(challenge.endDate)) {
      throw new ForbiddenException('Este desafio já terminou.');
    }
  }

  private assertActualMatchesKind(kind: GoalKind, dto: RecordDailyGoalDto | RecordPeriodGoalDto): void {
    if (kind === GoalKind.boolean) {
      if (dto.actualBoolean === undefined) {
        throw new BadRequestException('actualBoolean é obrigatório para metas do tipo sim/não.');
      }
      if (dto.actualValue !== undefined) {
        throw new BadRequestException('actualValue não deve ser informado para metas do tipo sim/não.');
      }
      return;
    }

    if (dto.actualValue === undefined) {
      throw new BadRequestException(`actualValue é obrigatório para metas do tipo ${kind}.`);
    }
    if (dto.actualBoolean !== undefined) {
      throw new BadRequestException(`actualBoolean não deve ser informado para metas do tipo ${kind}.`);
    }
  }
}
