import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Goal, GoalKind, GoalPeriod, GoalVersion, ParticipantStatus } from '@prisma/client';
import {
  currentMonthRangeInSaoPaulo,
  currentWeekRangeInSaoPaulo,
  toDateString,
  todayInSaoPaulo,
} from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';
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

  // Upsert por (goal_id, record_date) para a meta diária de HOJE — mesmo
  // padrão de recordCurrentWeek/Month/Challenge: pode ser chamado quantas
  // vezes quiser ao longo do dia, uma meta de cada vez (registrar agora,
  // outra mais tarde, corrigir uma já enviada). Regra revisada com o
  // usuário: não existe mais "check-in único por dia" — o trigger
  // reconcile_daily_period (supabase/migrations/20260914090000) decide
  // streak e pontos de forma reativa a cada chamada, podendo inclusive
  // reverter o streak se uma correção derrubar o dia de 3/3 para menos.
  async recordCurrentDaily(goalId: string, userId: string, dto: RecordDailyGoalDto) {
    const { goal, currentVersion } = await this.resolveOpenGoalVersion(goalId, userId, GoalPeriod.daily);

    this.assertActualMatchesKind(currentVersion.kind, dto);

    const today = new Date(todayInSaoPaulo());

    return this.prisma.dailyRecord.upsert({
      where: { goalId_recordDate: { goalId, recordDate: today } },
      create: {
        goalId,
        goalVersionId: currentVersion.id,
        challengeParticipantId: goal.challengeParticipantId,
        recordDate: today,
        actualValue: dto.actualValue,
        actualBoolean: dto.actualBoolean,
        // Placeholders coerentes com a versão vigente: os triggers
        // compute_daily_record_fields/enforce_daily_record_window do banco
        // recalculam kind/importance/targetValueSnapshot/completed/
        // pointsAwarded a partir do goal_version_id, sobrescrevendo
        // qualquer valor enviado aqui.
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
    });
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

  // Série compacta de dias fechados, para o heatmap do ano — uma célula por
  // dia. Separado de getHistory de propósito: aquele carrega também todos os
  // registros de cada dia (até ~1.100 linhas num desafio de 365 dias), o que
  // é desperdício quando a tela só precisa da intensidade por data.
  async getDaySeries(participantId: string) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { id: participantId },
      select: { id: true, challenge: { select: { startDate: true, endDate: true } } },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }

    const days = await this.prisma.dayResult.findMany({
      // Mesmo filtro de getHistory: o heatmap desenha uma célula por dia do
      // desafio, e um dia anterior ao início não tem célula onde cair.
      where: {
        challengeParticipantId: participantId,
        closed: true,
        resultDate: { gte: participant.challenge.startDate },
      },
      orderBy: { resultDate: 'asc' },
      select: { resultDate: true, completedGoalsCount: true, dayCompleted: true },
    });

    return {
      startDate: participant.challenge.startDate,
      endDate: participant.challenge.endDate,
      days,
    };
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
      select: { id: true, challenge: { select: { startDate: true } } },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }

    const dayResults = await this.prisma.dayResult.findMany({
      // `resultDate >= startDate` não é redundante com a correção do job
      // noturno (migration 20260912090000): aquela impede que dias
      // anteriores ao início do desafio sejam CRIADOS daqui pra frente,
      // esta garante que nenhum já existente seja EXIBIDO.
      //
      // Um dia anterior ao início do desafio é impossível por definição —
      // o backend recusava check-in nessa data — então exibi-lo como "0/3,
      // dia perdido" é mostrar uma derrota que não podia acontecer. Filtrar
      // na leitura resolve sem depender de limpeza de dado em produção, e
      // cobre qualquer linha remanescente do bug antigo.
      where: {
        challengeParticipantId: participantId,
        closed: true,
        resultDate: { gte: participant.challenge.startDate },
      },
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
