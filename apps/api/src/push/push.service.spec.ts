import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

const sendNotification = webpush.sendNotification as unknown as jest.Mock;

describe('PushService', () => {
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let updateMany: jest.Mock;
  let upsert: jest.Mock;
  let count: jest.Mock;
  let prisma: PrismaService;

  function build(configured = true): PushService {
    const config = {
      get: (key: string) =>
        configured
          ? { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.com' }[key]
          : undefined,
    } as unknown as ConfigService;
    return new PushService(prisma, config);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    findMany = jest.fn().mockResolvedValue([]);
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    upsert = jest.fn();
    count = jest.fn().mockResolvedValue(0);

    prisma = {
      pushSubscription: { findMany, deleteMany, updateMany, upsert, count },
    } as unknown as PrismaService;
    sendNotification.mockResolvedValue(undefined);
  });

  function subscription(endpoint: string) {
    return { endpoint, p256dh: 'p', auth: 'a', userId: 'u1' };
  }

  describe('configuração', () => {
    it('reporta não configurado sem chaves VAPID e não envia nada', async () => {
      const service = build(false);

      expect(service.isConfigured()).toBe(false);
      await expect(service.sendToUser('u1', { title: 't', body: 'b' })).resolves.toBe(0);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('registra as chaves no web-push quando configurado', () => {
      build(true);

      expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:a@b.com', 'pub', 'priv');
    });
  });

  describe('subscribe', () => {
    // O navegador pode devolver o mesmo endpoint numa reinscrição, e a mesma
    // pessoa reinstalando o app não deve virar linha duplicada.
    it('faz upsert pelo endpoint e atualiza o dono', async () => {
      const service = build();

      await service.subscribe('u2', { endpoint: 'https://push/1', p256dh: 'novo', auth: 'novo' });

      expect(upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push/1' },
        create: { userId: 'u2', endpoint: 'https://push/1', p256dh: 'novo', auth: 'novo' },
        update: { userId: 'u2', p256dh: 'novo', auth: 'novo' },
      });
    });
  });

  describe('unsubscribe', () => {
    // Não dá para desinscrever o aparelho alheio: o filtro leva o userId.
    it('só apaga a inscrição do próprio dono', async () => {
      const service = build();
      deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.unsubscribe('u1', 'https://push/1')).resolves.toEqual({ removed: 1 });
      expect(deleteMany).toHaveBeenCalledWith({ where: { endpoint: 'https://push/1', userId: 'u1' } });
    });
  });

  describe('sendToUser', () => {
    it('envia para todos os dispositivos e conta as entregas', async () => {
      const service = build();
      findMany.mockResolvedValue([subscription('https://push/1'), subscription('https://push/2')]);

      await expect(service.sendToUser('u1', { title: 'Oi', body: 'Corpo', url: '/c/1' })).resolves.toBe(2);
      expect(sendNotification).toHaveBeenCalledTimes(2);
      // O corpo vai serializado — é o service worker que o interpreta.
      expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({
        title: 'Oi',
        body: 'Corpo',
        url: '/c/1',
      });
    });

    it('não consulta nem envia quando o usuário não tem dispositivo', async () => {
      const service = build();
      findMany.mockResolvedValue([]);

      await expect(service.sendToUser('u1', { title: 't', body: 'b' })).resolves.toBe(0);
      expect(sendNotification).not.toHaveBeenCalled();
    });

    // 404/410 significa inscrição morta (app desinstalado, permissão
    // revogada). Sem limpar, a tabela só cresce e todo envio fica mais lento
    // por causa de destinos que nunca mais vão responder.
    it.each([404, 410])('apaga a inscrição quando o serviço de push responde %i', async (statusCode) => {
      const service = build();
      findMany.mockResolvedValue([subscription('https://push/morto')]);
      sendNotification.mockRejectedValue({ statusCode });

      await expect(service.sendToUser('u1', { title: 't', body: 'b' })).resolves.toBe(0);
      expect(deleteMany).toHaveBeenCalledWith({ where: { endpoint: { in: ['https://push/morto'] } } });
    });

    // Um erro transitório (500, rede) não é motivo para descartar o
    // dispositivo — só o 404/410 é definitivo.
    it('mantém a inscrição quando a falha é transitória', async () => {
      const service = build();
      findMany.mockResolvedValue([subscription('https://push/1')]);
      sendNotification.mockRejectedValue({ statusCode: 500 });

      await expect(service.sendToUser('u1', { title: 't', body: 'b' })).resolves.toBe(0);
      expect(deleteMany).not.toHaveBeenCalled();
    });

    it('um dispositivo com problema não derruba os outros', async () => {
      const service = build();
      findMany.mockResolvedValue([subscription('https://push/1'), subscription('https://push/2')]);
      sendNotification.mockRejectedValueOnce({ statusCode: 500 }).mockResolvedValueOnce(undefined);

      await expect(service.sendToUser('u1', { title: 't', body: 'b' })).resolves.toBe(1);
    });
  });

  describe('filterSubscribed', () => {
    it('devolve conjunto vazio sem consultar quando a lista chega vazia', async () => {
      const service = build();

      await expect(service.filterSubscribed([])).resolves.toEqual(new Set());
      expect(findMany).not.toHaveBeenCalled();
    });

    it('devolve só quem tem ao menos um dispositivo', async () => {
      const service = build();
      findMany.mockResolvedValue([{ userId: 'u1' }]);

      await expect(service.filterSubscribed(['u1', 'u2'])).resolves.toEqual(new Set(['u1']));
    });
  });
});
