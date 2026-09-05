import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GoalKind, GoalPeriod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GoalVersionDto } from './dto/goal-version.dto';

const MAX_DAILY_GOALS = 3;
const SINGLE_INSTANCE_PERIODS: GoalPeriod[] = [GoalPeriod.weekly, GoalPeriod.monthly, GoalPeriod.challenge];

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  // Cria a identidade da meta e sua primeira versão, na mesma transação —
  // uma meta nunca existe sem conteúdo (CLAUDE.md seção 2 "Metas").
  async create(participantId: string, userId: string, dto: CreateGoalDto) {
    await this.assertOwnsParticipant(participantId, userId);
    this.assertTargetValueMatchesKind(dto);
    await this.assertPeriodLimitAvailable(participantId, dto.periodType);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const goal = await tx.goal.create({
          data: { challengeParticipantId: participantId, periodType: dto.periodType },
        });

        const currentVersion = await tx.goalVersion.create({
          data: {
            goalId: goal.id,
            kind: dto.kind,
            importance: dto.importance,
            title: dto.title,
            targetValue: dto.targetValue,
          },
        });

        return { ...goal, currentVersion };
      });
    } catch (error) {
      throw this.translateLimitViolation(error, dto.periodType);
    }
  }

  async findAllForParticipant(participantId: string) {
    const goals = await this.prisma.goal.findMany({
      where: { challengeParticipantId: participantId },
      include: { versions: { where: { validUntil: null } } },
      orderBy: { createdAt: 'asc' },
    });

    return goals.map(({ versions, ...goal }) => ({
      ...goal,
      currentVersion: versions[0] ?? null,
    }));
  }

  // Mesmo formato de findAllForParticipant, mas para vários participantes
  // de uma vez (uma única query com IN, não uma por participante) — usado
  // por ProfilesService.getPublicProfile para listar as metas de cada
  // desafio do usuário sem um N+1 (etapa 18 "Performance").
  async findAllForParticipants(participantIds: string[]) {
    type GoalDto = Awaited<ReturnType<GoalsService['findAllForParticipant']>>[number];
    const byParticipant = new Map<string, GoalDto[]>();
    if (participantIds.length === 0) {
      return byParticipant;
    }

    const goals = await this.prisma.goal.findMany({
      where: { challengeParticipantId: { in: participantIds } },
      include: { versions: { where: { validUntil: null } } },
      orderBy: { createdAt: 'asc' },
    });

    for (const { versions, ...goal } of goals) {
      const dto = { ...goal, currentVersion: versions[0] ?? null };
      const bucket = byParticipant.get(goal.challengeParticipantId);
      if (bucket) bucket.push(dto);
      else byParticipant.set(goal.challengeParticipantId, [dto]);
    }
    return byParticipant;
  }

  // Fecha a versão vigente e abre uma nova — nunca UPDATE no conteúdo de
  // uma versão existente (histórico permanece intacto, CLAUDE.md seção 2
  // "Histórico" / docs/database-schema.md, função set_goal_version).
  async setVersion(goalId: string, userId: string, dto: GoalVersionDto) {
    this.assertTargetValueMatchesKind(dto);

    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
      include: { challengeParticipant: true },
    });

    if (!goal) {
      throw new NotFoundException('Meta não encontrada.');
    }

    if (goal.challengeParticipant.userId !== userId) {
      throw new ForbiddenException('Você não pode editar a meta de outro participante.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.goalVersion.updateMany({
        where: { goalId, validUntil: null },
        data: { validUntil: new Date() },
      });

      return tx.goalVersion.create({
        data: {
          goalId,
          kind: dto.kind,
          importance: dto.importance,
          title: dto.title,
          targetValue: dto.targetValue,
        },
      });
    });
  }

  private assertTargetValueMatchesKind(dto: GoalVersionDto): void {
    if (dto.kind === GoalKind.boolean && dto.targetValue !== undefined) {
      throw new BadRequestException('targetValue não deve ser informado para metas do tipo sim/não.');
    }
  }

  private async assertOwnsParticipant(participantId: string, userId: string): Promise<void> {
    const participant = await this.prisma.challengeParticipant.findUnique({ where: { id: participantId } });

    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }

    if (participant.userId !== userId) {
      throw new ForbiddenException('Você não pode configurar metas de outro participante.');
    }
  }

  // Piso (mínimo 3 diárias) é responsabilidade da etapa 6 (registro diário
  // depende das 3 já existirem) — aqui só o teto, para dar um erro amigável
  // antes de bater no trigger/índice único do banco.
  private async assertPeriodLimitAvailable(participantId: string, periodType: GoalPeriod): Promise<void> {
    if (periodType === GoalPeriod.daily) {
      const count = await this.prisma.goal.count({
        where: { challengeParticipantId: participantId, periodType: GoalPeriod.daily },
      });

      if (count >= MAX_DAILY_GOALS) {
        throw new ConflictException('Este participante já tem as 3 metas diárias configuradas.');
      }
      return;
    }

    if (SINGLE_INSTANCE_PERIODS.includes(periodType)) {
      const existing = await this.prisma.goal.findFirst({
        where: { challengeParticipantId: participantId, periodType },
      });

      if (existing) {
        throw new ConflictException(`Este participante já tem uma meta do tipo "${periodType}" configurada.`);
      }
    }
  }

  // Rede de segurança para corrida entre duas criações simultâneas: os
  // índices únicos parciais (semanal/mensal/desafio) protegem mesmo se a
  // checagem acima passou para ambas as requisições ao mesmo tempo.
  private translateLimitViolation(error: unknown, periodType: GoalPeriod): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException(`Este participante já tem uma meta do tipo "${periodType}" configurada.`);
    }
    return error;
  }
}
