import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SpecialGoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialGoalDto } from './dto/create-special-goal.dto';

// Teto de metas especiais PENDENTES de um participante para outro. Não é um
// limite de quantas podem existir no total — cumprir ou recusar libera
// espaço imediatamente.
const MAX_PENDING_PER_PAIR = 5;

// Meta especial: tarefa avulsa que um participante atribui a outro do
// mesmo desafio. Decisão de negócio confirmada com o usuário, fora do
// modelo original de metas (CLAUDE.md seção 2 "Outras regras já
// confirmadas") — aplicada direto (sem aceite), sempre sim/não, sem prazo
// fixo, puramente social: nunca gera pontos nem afeta streak/ranking.
@Injectable()
export class SpecialGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(challengeId: string, userId: string, dto: CreateSpecialGoalDto) {
    const fromParticipant = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
    });

    if (!fromParticipant) {
      throw new ForbiddenException('Você não participa deste desafio.');
    }

    if (dto.toParticipantId === fromParticipant.id) {
      throw new BadRequestException('Não é possível atribuir uma meta especial a você mesmo.');
    }

    const toParticipant = await this.prisma.challengeParticipant.findUnique({
      where: { id: dto.toParticipantId },
    });

    if (!toParticipant || toParticipant.challengeId !== challengeId) {
      throw new NotFoundException('Participante alvo não encontrado neste desafio.');
    }

    // A regra original não tinha limite, e o trigger prevent_special_goal_delete
    // impede qualquer apagamento — então dava para encher a lista de alguém
    // com tarefas-lixo permanentes. O teto é por PAR (A→B) e só conta
    // pendentes: cumprir ou recusar libera espaço na hora.
    const pendingFromMe = await this.prisma.specialGoal.count({
      where: {
        fromParticipantId: fromParticipant.id,
        toParticipantId: toParticipant.id,
        status: SpecialGoalStatus.pending,
      },
    });

    if (pendingFromMe >= MAX_PENDING_PER_PAIR) {
      throw new ConflictException(
        `Você já tem ${MAX_PENDING_PER_PAIR} metas especiais pendentes para esta pessoa. Espere ela resolver alguma.`,
      );
    }

    return this.prisma.specialGoal.create({
      data: {
        challengeId,
        fromParticipantId: fromParticipant.id,
        toParticipantId: toParticipant.id,
        title: dto.title,
      },
    });
  }

  // Lista pública dentro do desafio (CLAUDE.md seção 2 "Perfis") — enviadas
  // e recebidas de todos os participantes, mais recentes primeiro.
  async findAllForChallenge(challengeId: string) {
    return this.prisma.specialGoal.findMany({
      where: { challengeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Só o alvo (to_participant) pode concluir, e só enquanto pendente — o
  // trigger enforce_special_goal_transition no banco garante o mesmo
  // mesmo se este check de posse for contornado por outro caminho.
  async complete(specialGoalId: string, userId: string) {
    const specialGoal = await this.findOwnedPending(specialGoalId);

    if (specialGoal.toParticipant.userId !== userId) {
      throw new ForbiddenException('Só quem recebeu a meta especial pode marcá-la como cumprida.');
    }

    return this.prisma.specialGoal.update({
      where: { id: specialGoalId },
      data: { status: SpecialGoalStatus.completed, completedAt: new Date() },
    });
  }

  // Recusar: contrapartida de concluir, disponível só ao alvo. Sem isso a
  // meta especial era de mão única — quem recebia não tinha saída nenhuma,
  // porque o histórico é imutável e nada pode ser apagado.
  async decline(specialGoalId: string, userId: string) {
    const specialGoal = await this.findOwnedPending(specialGoalId);

    if (specialGoal.toParticipant.userId !== userId) {
      throw new ForbiddenException('Só quem recebeu a meta especial pode recusá-la.');
    }

    return this.prisma.specialGoal.update({
      where: { id: specialGoalId },
      data: { status: SpecialGoalStatus.declined, declinedAt: new Date() },
    });
  }

  // Quantas metas especiais estão esperando uma ação DESTE participante —
  // usado pelo badge na navegação. Sem ele a funcionalidade era invisível:
  // quem recebia só descobria se abrisse a aba por conta própria.
  async countPendingFor(participantId: string) {
    const pending = await this.prisma.specialGoal.count({
      where: { toParticipantId: participantId, status: SpecialGoalStatus.pending },
    });

    return { participantId, pending };
  }

  // Só quem criou (from_participant) pode cancelar, e só enquanto pendente.
  async cancel(specialGoalId: string, userId: string) {
    const specialGoal = await this.findOwnedPending(specialGoalId);

    if (specialGoal.fromParticipant.userId !== userId) {
      throw new ForbiddenException('Só quem criou a meta especial pode cancelá-la.');
    }

    return this.prisma.specialGoal.update({
      where: { id: specialGoalId },
      data: { status: SpecialGoalStatus.cancelled, cancelledAt: new Date() },
    });
  }

  private async findOwnedPending(specialGoalId: string) {
    const specialGoal = await this.prisma.specialGoal.findUnique({
      where: { id: specialGoalId },
      include: { fromParticipant: true, toParticipant: true },
    });

    if (!specialGoal) {
      throw new NotFoundException('Meta especial não encontrada.');
    }

    if (specialGoal.status !== SpecialGoalStatus.pending) {
      throw new BadRequestException('Esta meta especial já foi concluída ou cancelada.');
    }

    return specialGoal;
  }
}
