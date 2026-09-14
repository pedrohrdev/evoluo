import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ParticipantStatus } from '@prisma/client';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { RecordsService } from '../records/records.service';
import { StreakService } from '../streak/streak.service';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const AVATAR_BUCKET = 'avatars';

// Só os tipos que o bucket aceita (supabase/migrations/<...>_avatars_storage.sql,
// allowed_mime_types) — mantenha os dois em sincronia.
const ALLOWED_AVATAR_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
    private readonly recordsService: RecordsService,
    private readonly streakService: StreakService,
    private readonly rankingService: RankingService,
    private readonly supabase: SupabaseService,
  ) {}

  async findById(id: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado.');
    }

    return profile;
  }

  // Perfil público (CLAUDE.md seção 2 "Perfis" / IMPLEMENTATION_PLAN etapa
  // 10): metas, streak, pontos e estatísticas básicas de cada participação
  // do usuário, ativa ou não — sair de um desafio não apaga nada do perfil
  // (CLAUDE.md seção 2 "Outras regras já confirmadas"). Só os agregados já
  // mantidos por Goals/Streak/Scoring são expostos aqui; o histórico dia a
  // dia (registros individuais) fica para a etapa 11, para não a
  // antecipar.
  async getPublicProfile(id: string) {
    const profile = await this.findById(id);

    const participations = await this.prisma.challengeParticipant.findMany({
      where: { userId: id },
      include: {
        challenge: {
          select: { id: true, name: true, durationDays: true, startDate: true, endDate: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const participantIds = participations.map((participant) => participant.id);

    // Uma única query para as metas de todas as participações (nunca uma
    // por desafio) — evita um N+1 quando o usuário está em vários desafios
    // (etapa 18 "Performance"). O mesmo vale para o último check-in: uma
    // única agregação (groupBy) em vez de uma consulta por participação —
    // usado pelo frontend pra escolher qual desafio mostrar de cara quando
    // a pessoa está em mais de um (o mais recentemente ativo).
    const [goalsByParticipant, lastCheckIns] = await Promise.all([
      this.goalsService.findAllForParticipants(participantIds),
      participantIds.length > 0
        ? this.prisma.dailyRecord.groupBy({
            by: ['challengeParticipantId'],
            where: { challengeParticipantId: { in: participantIds } },
            _max: { recordDate: true },
          })
        : Promise.resolve([]),
    ]);

    const lastCheckInByParticipant = new Map(
      lastCheckIns.map((row) => [row.challengeParticipantId, row._max.recordDate]),
    );

    const challenges = participations.map((participant) => ({
      challengeId: participant.challenge.id,
      challengeName: participant.challenge.name,
      durationDays: participant.challenge.durationDays,
      startDate: participant.challenge.startDate,
      endDate: participant.challenge.endDate,
      participantId: participant.id,
      status: participant.status,
      joinedAt: participant.joinedAt,
      leftAt: participant.leftAt,
      currentStreak: participant.currentStreak,
      longestStreak: participant.longestStreak,
      totalPoints: participant.totalPoints,
      totalDaysCompleted: participant.totalDaysCompleted,
      lastCheckInDate: lastCheckInByParticipant.get(participant.id) ?? null,
      goals: goalsByParticipant.get(participant.id) ?? [],
    }));

    return { ...profile, challenges };
  }

  // Bootstrap do painel do próprio usuário (onboarding -> /c/:id) numa
  // única chamada: hoje o frontend precisava de 2 idas-e-voltas
  // sequenciais (perfil, pra saber o desafio padrão, e só depois
  // goals/today/streak/ranking desse desafio) — cada uma pagando o custo
  // de Vercel -> Render -> Supabase. Aqui o segundo grupo já sai embutido
  // pro desafio padrão, calculado com a MESMA regra do frontend
  // (pickDefaultChallenge, lib/challenge/pick-default-challenge.ts —
  // mantenha as duas em sincronia). Puramente uma otimização de leitura:
  // nenhum dos 4 serviços chamados abaixo é duplicado, cada um continua
  // sendo a única fonte da própria regra.
  async getOwnDashboard(userId: string) {
    const profile = await this.getPublicProfile(userId);
    const defaultParticipation = this.pickDefaultChallenge(profile.challenges);

    if (!defaultParticipation) {
      return { ...profile, defaultChallenge: null };
    }

    const [today, streak, ranking] = await Promise.all([
      this.recordsService.getTodayState(defaultParticipation.participantId),
      this.streakService.getStreak(defaultParticipation.participantId),
      this.rankingService.getRanking(defaultParticipation.challengeId),
    ]);

    return {
      ...profile,
      defaultChallenge: {
        challengeId: defaultParticipation.challengeId,
        participantId: defaultParticipation.participantId,
        today,
        streak,
        ranking,
      },
    };
  }

  // Espelha exatamente pickDefaultChallenge do frontend
  // (apps/web/src/lib/challenge/pick-default-challenge.ts): desafios
  // ativos primeiro, depois o de check-in diário mais recente, ou o mais
  // recém-entrado (challenges[0], já vem ordenado por joinedAt desc) se
  // ninguém ainda fez check-in.
  private pickDefaultChallenge<
    T extends { status: ParticipantStatus; lastCheckInDate: Date | null },
  >(challenges: T[]): T | undefined {
    const active = challenges.filter((c) => c.status === ParticipantStatus.active);
    if (active.length === 0) return undefined;

    const withCheckIn = active.filter(
      (c): c is T & { lastCheckInDate: Date } => c.lastCheckInDate !== null,
    );
    if (withCheckIn.length === 0) return active[0];

    return withCheckIn.reduce((latest, c) => (c.lastCheckInDate > latest.lastCheckInDate ? c : latest));
  }

  async updateOwn(id: string, dto: UpdateProfileDto) {
    await this.findById(id);

    return this.prisma.profile.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        updatedAt: new Date(),
      },
    });
  }

  // Sobe o arquivo pro bucket público `avatars` do Supabase Storage (via
  // adminClient/service role — o mesmo caminho de confiança que o resto do
  // NestJS já usa, nunca exposto ao frontend) e só então grava avatar_url —
  // path fixo por usuário (upsert: true) para nunca acumular arquivos órfãos
  // de uploads antigos. `?v=` na URL invalida cache de CDN/browser depois
  // de reenviar a foto (mesmo path, conteúdo novo).
  async uploadAvatar(id: string, file: { buffer: Buffer; mimetype: string }) {
    await this.findById(id);

    const extension = ALLOWED_AVATAR_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Formato de imagem não suportado. Envie JPEG, PNG ou WEBP.');
    }

    const path = `${id}/avatar.${extension}`;

    const { error: uploadError } = await this.supabase.adminClient.storage
      .from(AVATAR_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });

    if (uploadError) {
      throw new BadRequestException(`Não foi possível salvar a foto de perfil: ${uploadError.message}`);
    }

    const {
      data: { publicUrl },
    } = this.supabase.adminClient.storage.from(AVATAR_BUCKET).getPublicUrl(path);

    return this.prisma.profile.update({
      where: { id },
      data: { avatarUrl: `${publicUrl}?v=${Date.now()}`, updatedAt: new Date() },
    });
  }
}
