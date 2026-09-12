import { ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  let participantFindMany: jest.Mock;
  let profileFindMany: jest.Mock;
  let filterSubscribed: jest.Mock;
  let sendToUser: jest.Mock;
  let isConfigured: jest.Mock;
  let service: RemindersService;

  beforeEach(() => {
    participantFindMany = jest.fn().mockResolvedValue([]);
    profileFindMany = jest.fn().mockResolvedValue([]);
    filterSubscribed = jest.fn().mockResolvedValue(new Set<string>());
    sendToUser = jest.fn().mockResolvedValue(1);
    isConfigured = jest.fn().mockReturnValue(false);

    const prisma = {
      challengeParticipant: { findMany: participantFindMany },
      profile: { findMany: profileFindMany },
    } as unknown as PrismaService;

    const push = { filterSubscribed, sendToUser, isConfigured } as unknown as PushService;

    service = new RemindersService(prisma, push);
  });

  function participant(overrides: Record<string, unknown> = {}) {
    return {
      userId: 'u1',
      currentStreak: 12,
      challengeId: 'c1',
      challenge: { name: 'Verão 2026' },
      dayResults: [],
      ...overrides,
    };
  }

  describe('findPending', () => {
    it('asks only for active participants of a running challenge with no closed day today', async () => {
      await service.findPending();

      const where = participantFindMany.mock.calls[0][0].where;
      expect(where.status).toBe(ParticipantStatus.active);
      // Desafio em curso: começou e ainda não terminou.
      expect(where.challenge.startDate).toHaveProperty('lte');
      expect(where.challenge.endDate).toHaveProperty('gte');
      // Uma linha ABERTA (progresso tentativo) não conta como check-in feito
      // — só `closed: true` conta.
      expect(where.dayResults).toEqual({ none: { resultDate: expect.any(Date), closed: true } });
    });

    it('joins the profile name into each reminder', async () => {
      participantFindMany.mockResolvedValue([participant({ dayResults: [{ completedGoalsCount: 2 }] })]);
      profileFindMany.mockResolvedValue([{ id: 'u1', displayName: 'Pedro' }]);
      filterSubscribed.mockResolvedValue(new Set(['u1']));

      const pending = await service.findPending();

      expect(pending).toEqual([
        {
          userId: 'u1',
          displayName: 'Pedro',
          challengeName: 'Verão 2026',
          challengeId: 'c1',
          currentStreak: 12,
          completedToday: 2,
        },
      ]);
    });

    // Sem dispositivo inscrito não há para onde mandar — contar essa pessoa
    // como "pendente" inflaria o relatório com destinos inexistentes.
    it('drops participants with no subscribed device', async () => {
      participantFindMany.mockResolvedValue([participant()]);
      profileFindMany.mockResolvedValue([{ id: 'u1', displayName: 'Pedro' }]);
      filterSubscribed.mockResolvedValue(new Set<string>());

      await expect(service.findPending()).resolves.toEqual([]);
    });

    it('does not touch profiles or push when nobody is pending', async () => {
      participantFindMany.mockResolvedValue([]);

      await expect(service.findPending()).resolves.toEqual([]);
      expect(profileFindMany).not.toHaveBeenCalled();
      expect(filterSubscribed).not.toHaveBeenCalled();
    });
  });

  describe('buildMessage', () => {
    const base = {
      userId: 'u1',
      displayName: 'Pedro',
      challengeName: 'Verão 2026',
      challengeId: 'c1',
    };

    // O lembrete só funciona se for concreto: "faltam 2 metas para manter
    // seus 12 dias", nunca "você tem pendências".
    it('leads with what is at stake when there is a streak', () => {
      const { subject, body } = service.buildMessage({ ...base, currentStreak: 12, completedToday: 1 });

      expect(subject).toBe('Seu streak de 12 dias acaba à meia-noite');
      expect(body).toContain('Faltam 2 metas');
      expect(body).toContain('12 dias de streak');
      expect(body).toContain('Verão 2026');
      // Corpo de notificação, não de e-mail: sem saudação nem assinatura,
      // porque o sistema trunca e a primeira linha é tudo que se lê.
      expect(body).not.toContain('Oi,');
    });

    it('singularizes a one-day streak', () => {
      const { subject } = service.buildMessage({ ...base, currentStreak: 1, completedToday: 0 });

      expect(subject).toBe('Seu streak de 1 dia acaba à meia-noite');
    });

    it('drops the streak framing when there is nothing to lose yet', () => {
      const { subject, body } = service.buildMessage({ ...base, currentStreak: 0, completedToday: 2 });

      expect(subject).toBe('Você ainda não fez o check-in de hoje');
      expect(body).toContain('Falta 1 meta');
      expect(body).not.toContain('streak');
    });
  });

  describe('sendDailyReminders', () => {
    function twoPending() {
      participantFindMany.mockResolvedValue([participant(), participant({ userId: 'u2' })]);
      profileFindMany.mockResolvedValue([
        { id: 'u1', displayName: 'Pedro' },
        { id: 'u2', displayName: 'Ana' },
      ]);
      filterSubscribed.mockResolvedValue(new Set(['u1', 'u2']));
    }

    // A rota precisa poder ir para produção antes das chaves existirem:
    // sem VAPID, registra o que faria e não falha.
    it('is a no-op with a report when VAPID keys are missing', async () => {
      participantFindMany.mockResolvedValue([participant()]);
      profileFindMany.mockResolvedValue([{ id: 'u1', displayName: 'Pedro' }]);
      filterSubscribed.mockResolvedValue(new Set(['u1']));

      await expect(service.sendDailyReminders()).resolves.toEqual({
        pending: 1,
        sent: 0,
        skipped: 'chaves VAPID ausentes',
      });
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('pushes to every pending user once configured', async () => {
      isConfigured.mockReturnValue(true);
      twoPending();

      await expect(service.sendDailyReminders()).resolves.toEqual({ pending: 2, sent: 2, skipped: null });
      expect(sendToUser).toHaveBeenCalledTimes(2);
    });

    // Tocar na notificação leva direto ao desafio em questão, não à raiz.
    it('deep-links the notification to the challenge', async () => {
      isConfigured.mockReturnValue(true);
      twoPending();

      await service.sendDailyReminders();

      expect(sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/c/c1' }));
    });

    // Uma pessoa pode ter vários dispositivos — `sent` conta entregas, não
    // pessoas.
    it('counts devices reached, not people', async () => {
      isConfigured.mockReturnValue(true);
      twoPending();
      sendToUser.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

      await expect(service.sendDailyReminders()).resolves.toMatchObject({ pending: 2, sent: 4 });
    });
  });
});
