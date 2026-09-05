import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalKind, GoalPeriod } from '@prisma/client';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';

interface RawRecord {
  goalId: string;
  actualValue: unknown;
  actualBoolean: boolean | null;
  kind: GoalKind;
}

export interface KindAggregate {
  kind: GoalKind;
  recordsCount: number;
  // Presentes só para horas/quantidade (o valor real é numérico).
  sum?: number;
  average?: number;
  min?: number;
  max?: number;
  // Presente só para sim/não (não há valor numérico a somar).
  completedCount?: number;
}

// Analytics usa sempre os valores REAIS registrados (actual_value/
// actual_boolean), nunca só o campo `completed` (CLAUDE.md seção
// "Analytics" / IMPLEMENTATION_PLAN etapa 14) — por isso agrupa e soma os
// registros brutos aqui, em vez de reaproveitar PointsService/StreakService
// (que só enxergam cumpriu/não cumpriu). Deliberadamente independente de
// Scoring e Streak (docs/arquitetura-tecnica.md seção 3), lendo direto de
// Daily/Weekly/Monthly/ChallengeRecord.
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
  ) {}

  async getParticipantAnalytics(participantId: string) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { id: participantId },
      select: { id: true },
    });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }

    const goals = await this.goalsService.findAllForParticipant(participantId);
    const recordsByGoal = await this.fetchRecordsByPeriod(goals.map((goal) => ({ id: goal.id, periodType: goal.periodType })));

    return goals.map((goal) => {
      const records = recordsByGoal.get(goal.id) ?? [];
      return {
        ...goal,
        recordsCount: records.length,
        byKind: this.aggregateByKind(records),
      };
    });
  }

  // Uma consulta por tabela (no máximo 4 — daily/weekly/monthly/challenge),
  // nunca uma por meta: evita um N+1 quando o participante tem várias metas
  // do mesmo período (etapa 18 "Performance" / arquitetura seção 7).
  private async fetchRecordsByPeriod(
    goals: { id: string; periodType: GoalPeriod }[],
  ): Promise<Map<string, RawRecord[]>> {
    const select = { goalId: true, actualValue: true, actualBoolean: true, kind: true } as const;
    const idsByPeriod = new Map<GoalPeriod, string[]>();
    for (const goal of goals) {
      const bucket = idsByPeriod.get(goal.periodType);
      if (bucket) bucket.push(goal.id);
      else idsByPeriod.set(goal.periodType, [goal.id]);
    }

    const queries = Array.from(idsByPeriod.entries()).map(([periodType, goalIds]) => {
      const where = { goalId: { in: goalIds } };
      switch (periodType) {
        case GoalPeriod.daily:
          return this.prisma.dailyRecord.findMany({ where, select });
        case GoalPeriod.weekly:
          return this.prisma.weeklyRecord.findMany({ where, select });
        case GoalPeriod.monthly:
          return this.prisma.monthlyRecord.findMany({ where, select });
        case GoalPeriod.challenge:
          return this.prisma.challengeRecord.findMany({ where, select });
      }
    });

    const results = await Promise.all(queries);

    const byGoal = new Map<string, RawRecord[]>();
    for (const record of results.flat()) {
      const bucket = byGoal.get(record.goalId);
      if (bucket) bucket.push(record);
      else byGoal.set(record.goalId, [record]);
    }
    return byGoal;
  }

  // Agrupado pelo `kind` gravado em cada registro (o snapshot da versão
  // vigente no momento, não a configuração atual da meta) — assim uma
  // eventual troca de tipo no meio da vida da meta nunca reinterpreta
  // registros antigos com a unidade errada.
  private aggregateByKind(records: RawRecord[]): KindAggregate[] {
    const groups = new Map<GoalKind, RawRecord[]>();
    for (const record of records) {
      const bucket = groups.get(record.kind);
      if (bucket) {
        bucket.push(record);
      } else {
        groups.set(record.kind, [record]);
      }
    }

    return Array.from(groups.entries()).map(([kind, groupRecords]) => {
      if (kind === GoalKind.boolean) {
        return {
          kind,
          recordsCount: groupRecords.length,
          completedCount: groupRecords.filter((record) => record.actualBoolean === true).length,
        };
      }

      const values = groupRecords
        .map((record) => (record.actualValue === null ? null : Number(record.actualValue)))
        .filter((value): value is number => value !== null);

      return {
        kind,
        recordsCount: groupRecords.length,
        sum: values.reduce((total, value) => total + value, 0),
        average: values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0,
        min: values.length > 0 ? Math.min(...values) : 0,
        max: values.length > 0 ? Math.max(...values) : 0,
      };
    });
  }
}
