import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GoalKind, GoalPeriod, ParticipantStatus } from '@prisma/client';
import { todayInSaoPaulo } from '../common/date/sao-paulo.util';
import { PrismaService } from '../prisma/prisma.service';
import { RecordDailyGoalDto } from './dto/record-daily-goal.dto';

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  // Upsert por (goal_id, record_date) — reenviar a mesma requisição no
  // mesmo dia atualiza o valor em vez de duplicar pontos (CLAUDE.md seção
  // 2 "Cumprimento de metas" / arquitetura seção 6, idempotência). A data
  // nunca vem do cliente: é sempre "hoje" em America/Sao_Paulo, o que já
  // impede edição retroativa por este caminho.
  async recordToday(goalId: string, userId: string, dto: RecordDailyGoalDto) {
    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        challengeParticipant: true,
        versions: { where: { validUntil: null } },
      },
    });

    if (!goal) {
      throw new NotFoundException('Meta não encontrada.');
    }

    if (goal.challengeParticipant.userId !== userId) {
      throw new ForbiddenException('Você não pode registrar a meta de outro participante.');
    }

    if (goal.periodType !== GoalPeriod.daily) {
      throw new BadRequestException('Este endpoint só registra metas diárias.');
    }

    if (goal.challengeParticipant.status !== ParticipantStatus.active) {
      throw new ForbiddenException('Não é possível registrar metas de um desafio que você já deixou.');
    }

    const currentVersion = goal.versions[0];
    if (!currentVersion) {
      throw new ConflictException('Esta meta não tem uma versão vigente configurada.');
    }

    this.assertActualMatchesKind(currentVersion.kind, dto);

    const recordDate = new Date(todayInSaoPaulo());

    return this.prisma.dailyRecord.upsert({
      where: { goalId_recordDate: { goalId, recordDate } },
      create: {
        goalId,
        goalVersionId: currentVersion.id,
        challengeParticipantId: goal.challengeParticipantId,
        recordDate,
        actualValue: dto.actualValue,
        actualBoolean: dto.actualBoolean,
        // Placeholders coerentes com a versão vigente: os triggers
        // compute_daily_record_fields/enforce_daily_record_window do banco
        // recalculam kind/importance/targetValueSnapshot/completed/
        // pointsAwarded a partir do goal_version_id, sobrescrevendo
        // qualquer valor enviado aqui (docs/database-schema.md).
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

    const records = await this.prisma.dailyRecord.findMany({
      where: {
        challengeParticipantId: participantId,
        recordDate: { in: dayResults.map((dayResult) => dayResult.resultDate) },
      },
      orderBy: { recordDate: 'desc' },
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
      records: recordsByDate.get(dayResult.resultDate.getTime()) ?? [],
    }));
  }

  private assertActualMatchesKind(kind: GoalKind, dto: RecordDailyGoalDto): void {
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
