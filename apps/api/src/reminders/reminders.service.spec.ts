import { ConfigService } from '@nestjs/config';
import { ParticipantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  let participantFindMany: jest.Mock;
  let profileFindMany: jest.Mock;
  let listUsers: jest.Mock;
  let configGet: jest.Mock;
  let service: RemindersService;

  beforeEach(() => {
    participantFindMany = jest.fn().mockResolvedValue([]);
    profileFindMany = jest.fn().mockResolvedValue([]);
    listUsers = jest.fn().mockResolvedValue({ data: { users: [] }, error: null });
    configGet = jest.fn().mockReturnValue(undefined);

    const prisma = {
      challengeParticipant: { findMany: participantFindMany },
      profile: { findMany: profileFindMany },
    } as unknown as PrismaService;

    const supabase = {
      adminClient: { auth: { admin: { listUsers } } },
    } as unknown as SupabaseService;

    service = new RemindersService(prisma, supabase, { get: configGet } as unknown as ConfigService);
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

    it('joins profile name and auth e-mail into each reminder', async () => {
      participantFindMany.mockResolvedValue([participant({ dayResults: [{ completedGoalsCount: 2 }] })]);
      profileFindMany.mockResolvedValue([{ id: 'u1', displayName: 'Pedro' }]);
      listUsers.mockResolvedValue({ data: { users: [{ id: 'u1', email: 'pedro@test.dev' }] }, error: null });

      const pending = await service.findPending();

      expect(pending).toEqual([
        {
          userId: 'u1',
          email: 'pedro@test.dev',
          displayName: 'Pedro',
          challengeName: 'Verão 2026',
          challengeId: 'c1',
          currentStreak: 12,
          completedToday: 2,
        },
      ]);
    });

    // Sem e-mail não há como lembrar — a linha é descartada em vez de virar
    // um envio quebrado.
    it('drops participants whose e-mail cannot be resolved', async () => {
      participantFindMany.mockResolvedValue([participant()]);
      profileFindMany.mockResolvedValue([{ id: 'u1', displayName: 'Pedro' }]);
      listUsers.mockResolvedValue({ data: { users: [] }, error: null });

      await expect(service.findPending()).resolves.toEqual([]);
    });

    it('does not touch profiles or auth when nobody is pending', async () => {
      participantFindMany.mockResolvedValue([]);

      await expect(service.findPending()).resolves.toEqual([]);
      expect(profileFindMany).not.toHaveBeenCalled();
      expect(listUsers).not.toHaveBeenCalled();
    });
  });

  describe('buildMessage', () => {
    const base = {
      userId: 'u1',
      email: 'a@b.com',
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
    // A rota precisa poder ir para produção antes da credencial existir:
    // sem chave, registra o que faria e não falha.
    it('is a no-op with a report when e-mail credentials are missing', async () => {
      participantFindMany.mockResolvedValue([participant()]);
      profileFindMany.mockResolvedValue([{ id: 'u1', displayName: 'Pedro' }]);
      listUsers.mockResolvedValue({ data: { users: [{ id: 'u1', email: 'a@b.com' }] }, error: null });

      await expect(service.sendDailyReminders()).resolves.toEqual({
        pending: 1,
        sent: 0,
        skipped: 'credenciais de e-mail ausentes',
      });
    });

    it('sends one e-mail per pending reminder once configured', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'RESEND_API_KEY' ? 'key_123' : key === 'REMINDER_FROM_EMAIL' ? 'Evoluo <no@reply>' : undefined,
      );
      participantFindMany.mockResolvedValue([participant(), participant({ userId: 'u2' })]);
      profileFindMany.mockResolvedValue([
        { id: 'u1', displayName: 'Pedro' },
        { id: 'u2', displayName: 'Ana' },
      ]);
      listUsers.mockResolvedValue({
        data: {
          users: [
            { id: 'u1', email: 'pedro@test.dev' },
            { id: 'u2', email: 'ana@test.dev' },
          ],
        },
        error: null,
      });
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock as unknown as typeof fetch;

      await expect(service.sendDailyReminders()).resolves.toEqual({ pending: 2, sent: 2, skipped: null });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Um destinatário com problema não pode derrubar o lote.
    it('keeps going when one delivery fails', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'RESEND_API_KEY' ? 'key_123' : key === 'REMINDER_FROM_EMAIL' ? 'Evoluo <no@reply>' : undefined,
      );
      participantFindMany.mockResolvedValue([participant(), participant({ userId: 'u2' })]);
      profileFindMany.mockResolvedValue([
        { id: 'u1', displayName: 'Pedro' },
        { id: 'u2', displayName: 'Ana' },
      ]);
      listUsers.mockResolvedValue({
        data: {
          users: [
            { id: 'u1', email: 'pedro@test.dev' },
            { id: 'u2', email: 'ana@test.dev' },
          ],
        },
        error: null,
      });
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' })
        .mockResolvedValueOnce({ ok: true }) as unknown as typeof fetch;

      await expect(service.sendDailyReminders()).resolves.toEqual({ pending: 2, sent: 1, skipped: null });
    });
  });
});
