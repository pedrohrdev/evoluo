import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GoalsService } from '../goals/goals.service';
import { PrismaService } from '../prisma/prisma.service';
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

    // Uma única query para as metas de todas as participações (nunca uma
    // por desafio) — evita um N+1 quando o usuário está em vários desafios
    // (etapa 18 "Performance").
    const goalsByParticipant = await this.goalsService.findAllForParticipants(
      participations.map((participant) => participant.id),
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
      goals: goalsByParticipant.get(participant.id) ?? [],
    }));

    return { ...profile, challenges };
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
