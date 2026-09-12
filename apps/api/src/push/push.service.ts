import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Para onde levar quando a pessoa toca na notificação. */
  url?: string;
}

export interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Web Push.
 *
 * Escolhido em vez de e-mail (que foi a primeira implementação do lembrete,
 * na etapa 25) por decisão do usuário: um produto de streak precisa avisar
 * antes da meia-noite, e ninguém abre e-mail nessa hora. Push aparece na
 * tela como qualquer outra notificação do celular.
 *
 * Não depende de conta em serviço nenhum: as chaves VAPID são geradas pelo
 * próprio projeto (`npm run push:keys`) e identificam este servidor para os
 * serviços de push dos navegadores. Sem elas configuradas, o serviço vira
 * no-op com log — mesmo padrão do envio de e-mail, para a rota poder ir a
 * produção antes das chaves existirem.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly configured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    const publicKey = configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = configService.get<string>('VAPID_PRIVATE_KEY');
    // `mailto:` é exigido pelo protocolo VAPID: é o contato que o serviço de
    // push usa se as notificações deste servidor começarem a dar problema.
    const subject = configService.get<string>('VAPID_SUBJECT') ?? 'mailto:contato@evoluo.app';

    this.configured = Boolean(publicKey && privateKey);

    if (this.configured) {
      webpush.setVapidDetails(subject, publicKey!, privateKey!);
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Registra (ou reaproveita) a inscrição deste navegador.
   *
   * Upsert por `endpoint` porque o navegador pode devolver o mesmo endpoint
   * numa reinscrição — e porque a mesma pessoa reinstalando o app não deve
   * gerar linha duplicada. Se o endpoint migrou de usuário (dispositivo
   * emprestado, logout/login), o dono é atualizado.
   */
  async subscribe(userId: string, input: SubscribeInput) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth },
      update: { userId, p256dh: input.p256dh, auth: input.auth },
    });
  }

  /** Cancelar é do próprio dono — não dá para desinscrever o aparelho alheio. */
  async unsubscribe(userId: string, endpoint: string): Promise<{ removed: number }> {
    const { count } = await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
    return { removed: count };
  }

  async countFor(userId: string): Promise<number> {
    return this.prisma.pushSubscription.count({ where: { userId } });
  }

  /**
   * Envia para TODOS os dispositivos de um usuário.
   *
   * Devolve quantos receberam. Uma inscrição que o serviço de push rejeita
   * com 404/410 está morta (app desinstalado, permissão revogada) e é
   * apagada na hora — sem isso a tabela só cresce e cada envio fica mais
   * lento por causa de destinos que nunca mais vão responder.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.configured) {
      this.logger.warn('VAPID não configurado: push não enviado.');
      return 0;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) {
      return 0;
    }

    const body = JSON.stringify(payload);
    const expired: string[] = [];
    let sent = 0;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
          );
          sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            expired.push(subscription.endpoint);
          } else {
            // Um destino com problema nunca derruba o lote.
            this.logger.error(`Push falhou para ${subscription.endpoint.slice(0, 40)}…: ${String(error)}`);
          }
        }
      }),
    );

    if (expired.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: expired } } });
      this.logger.log(`${expired.length} inscrição(ões) expirada(s) removida(s).`);
    }

    if (sent > 0) {
      await this.prisma.pushSubscription.updateMany({
        where: { userId, endpoint: { notIn: expired } },
        data: { lastUsedAt: new Date() },
      });
    }

    return sent;
  }

  /** Quem tem pelo menos um dispositivo inscrito, dentro de um lote. */
  async filterSubscribed(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const rows = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true },
      distinct: ['userId'],
    });

    return new Set(rows.map((row) => row.userId));
  }
}

// Reexportado para os testes não precisarem importar o tipo do Prisma.
export type PushSubscriptionRow = Prisma.PushSubscriptionGetPayload<object>;
