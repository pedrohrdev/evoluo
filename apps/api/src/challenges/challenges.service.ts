import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { JoinChallengeDto } from './dto/join-challenge.dto';

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  // Criar um desafio já inclui o criador como participante ativo, na mesma
  // transação — decisão confirmada com o usuário: o criador não precisa
  // entrar de novo pelo próprio join_code para participar do desafio dele.
  async create(userId: string, dto: CreateChallengeDto) {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.create({
        data: {
          name: dto.name,
          description: dto.description,
          durationDays: dto.durationDays,
          startDate: new Date(dto.startDate),
          createdBy: userId,
        },
      });

      await tx.challengeParticipant.create({
        data: {
          challengeId: challenge.id,
          userId,
        },
      });

      return challenge;
    });
  }

  // Leitura pública (qualquer autenticado), por extensão da decisão de que
  // perfis são públicos — mas SEM o join_code. O código é o único controle
  // de acesso de entrada no desafio (CLAUDE.md seção 2), e o id do desafio
  // não é segredo: ele aparece no perfil público de qualquer participante
  // (ProfilesService.getPublicProfile). Devolver o código aqui permitiria
  // que qualquer usuário lesse os desafios de alguém pelo perfil e entrasse
  // em todos eles. Quem já participa pega o código em findJoinCode().
  async findById(id: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        durationDays: true,
        startDate: true,
        endDate: true,
        createdBy: true,
        createdAt: true,
      },
    });

    if (!challenge) {
      throw new NotFoundException('Desafio não encontrado.');
    }

    return challenge;
  }

  // O código de convite só para quem já está dentro do desafio — é o que
  // permite convidar mais alguém dias depois de criar, sem transformar o
  // código num dado público.
  async findJoinCode(challengeId: string, userId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, joinCode: true },
    });

    if (!challenge) {
      throw new NotFoundException('Desafio não encontrado.');
    }

    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
      select: { id: true },
    });

    if (!participant) {
      throw new ForbiddenException('Só quem participa do desafio pode ver o código de convite.');
    }

    return { challengeId: challenge.id, joinCode: challenge.joinCode };
  }

  // Prévia PÚBLICA de um convite, pelo código — a única rota do app que não
  // exige autenticação.
  //
  // Existe para o link de convite funcionar para quem ainda não tem conta:
  // a pessoa abre /join/ABCD2345, vê no que está entrando e só então se
  // cadastra. Devolve o mínimo (nome, duração, datas, quantos já entraram)
  // e NUNCA o id do desafio nem a lista de participantes — quem tem o
  // código já poderia entrar de qualquer forma, mas não há motivo para
  // vazar mais do que o necessário para a decisão de entrar.
  async previewByJoinCode(joinCode: string) {
    const normalized = joinCode.trim().toUpperCase();

    const challenge = await this.prisma.challenge.findUnique({
      where: { joinCode: normalized },
      select: { name: true, description: true, durationDays: true, startDate: true, endDate: true },
    });

    if (!challenge) {
      throw new NotFoundException('Nenhum desafio encontrado para este código.');
    }

    const participantCount = await this.prisma.challengeParticipant.count({
      where: { challenge: { joinCode: normalized }, status: ParticipantStatus.active },
    });

    return { ...challenge, participantCount };
  }

  // Basta ter o join_code para entrar — sem aprovação do criador (CLAUDE.md
  // seção 2, "Outras regras já confirmadas").
  async join(userId: string, dto: JoinChallengeDto) {
    const joinCode = dto.joinCode.trim().toUpperCase();

    const challenge = await this.prisma.challenge.findUnique({ where: { joinCode } });

    if (!challenge) {
      throw new NotFoundException('Nenhum desafio encontrado para este código.');
    }

    const existing = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId: challenge.id, userId } },
    });

    if (existing) {
      throw new ConflictException('Você já participa deste desafio.');
    }

    try {
      return await this.prisma.challengeParticipant.create({
        data: { challengeId: challenge.id, userId },
      });
    } catch (error) {
      // Corrida entre duas entradas simultâneas: a constraint única
      // (challenge_id, user_id) protege mesmo se a checagem acima passou.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Você já participa deste desafio.');
      }
      throw error;
    }
  }

  // Sair do desafio (CLAUDE.md seção 2, "Outras regras já confirmadas"):
  // marca o vínculo como inativo, NUNCA apaga nada. O participante some do
  // ranking ativo e não pode mais registrar, mas histórico, pontos e streaks
  // permanecem intactos e consultáveis no perfil. `left_at` é preenchido
  // pelo trigger trg_set_left_at_on_deactivate, nunca aqui.
  //
  // Vale também para o criador: a regra não abre exceção para ele, e
  // `created_by` não muda ao sair — ele continua sendo o único que pode
  // deletar o desafio (operação diferente, ver remove()).
  async leave(challengeId: string, userId: string) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
      select: { id: true, status: true },
    });

    if (!participant) {
      throw new NotFoundException('Você não participa deste desafio.');
    }

    if (participant.status === ParticipantStatus.inactive) {
      throw new ConflictException('Você já saiu deste desafio.');
    }

    return this.prisma.challengeParticipant.update({
      where: { id: participant.id },
      data: { status: ParticipantStatus.inactive },
    });
  }

  // Hard-delete total, confirmado com o usuário: só o criador pode apagar,
  // e a exclusão cascateia para TODOS os participantes (challenge_participants
  // e tudo que pendura nela — goals, records, day_results, points_ledger —
  // via "on delete cascade"), não só para o próprio criador. Diferente de
  // "sair do desafio" (que só marca o vínculo como inativo e preserva tudo):
  // aqui o desafio deixa de existir de vez, inclusive no perfil público de
  // quem participou.
  //
  // goal_versions normalmente nunca pode ser apagado (histórico imutável,
  // trg_prevent_goal_version_delete) — a flag local abaixo é a única forma
  // de destravar esse delete em cascata, e só existe aqui, depois que já
  // validamos que quem pediu é o dono. Ver
  // supabase/migrations/20260911090000_delete_challenge.sql.
  async remove(challengeId: string, userId: string): Promise<void> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, createdBy: true },
    });

    if (!challenge) {
      throw new NotFoundException('Desafio não encontrado.');
    }

    if (challenge.createdBy !== userId) {
      throw new ForbiddenException('Só quem criou o desafio pode deletá-lo.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.bypass_goal_version_immutability', 'on', true)`;
      await tx.challenge.delete({ where: { id: challengeId } });
    });
  }
}
