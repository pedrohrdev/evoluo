import type { Client } from 'pg';
import {
  connect,
  createChallenge,
  createThreeDailyGoals,
  createUser,
  participantState,
  resetSchema,
} from './db';

/**
 * `close_open_daily_periods` (migration 20260912090000) é a peça mais
 * delicada do fechamento: ela reprocessa dias que o cron não fechou.
 *
 * O risco que ela existe para evitar é uma corrupção silenciosa —
 * `close_daily_period` decide o streak sobre o `current_streak` ATUAL do
 * participante, não sobre o valor que ele tinha naquele dia. Reprocessar um
 * dia antigo depois que dias mais novos já fecharam sobrescreveria o streak
 * com uma decisão fora de ordem. Por isso a função pula (sem adivinhar)
 * quem já tem um dia posterior fechado.
 *
 * Nenhum teste unitário chega perto disso: tudo aqui é PL/pgSQL.
 */
describe('recuperação do fechamento noturno (integração)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect();
    await resetSchema(client);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  beforeEach(async () => {
    await client.query(
      `truncate points_ledger, day_results, daily_records, weekly_records, monthly_records,
       challenge_records, goal_versions, goals, special_goals, challenge_participants, challenges
       restart identity cascade`,
    );
    await client.query('delete from auth.users');
  });

  /** Data em America/Sao_Paulo, deslocada em dias. */
  async function dayOffset(offset: number): Promise<string> {
    const { rows } = await client.query<{ d: string }>(
      `select to_char(((now() at time zone 'America/Sao_Paulo')::date + $1::int), 'YYYY-MM-DD') as d`,
      [offset],
    );
    return rows[0].d;
  }

  /** Um dia já fechado, como o cron teria deixado. */
  async function seedClosedDay(participantId: string, date: string, completed: boolean, streakAfter: number) {
    await client.query(
      `insert into day_results
         (challenge_participant_id, result_date, completed_goals_count, day_completed, streak_after, closed)
       values ($1, $2::date, $3, $4, $5, true)`,
      [participantId, date, completed ? 3 : 0, completed, streakAfter],
    );
  }

  async function setupParticipant(startOffset: number) {
    const user = await createUser(client, `Ana${Math.random().toString(36).slice(2, 7)}`);
    const { participantId } = await createChallenge(client, user, {
      durationDays: 30,
      startDate: await dayOffset(startOffset),
    });
    await createThreeDailyGoals(client, participantId);

    // `joined_at` retroagido para o início do desafio: close_daily_period
    // só processa dias a partir da entrada do participante (ninguém pode
    // "falhar" um dia em que ainda não estava no desafio), então sem isto
    // um participante criado agora nunca teria dia nenhum para fechar.
    await client.query(
      `update challenge_participants
       set joined_at = (($1::date)::timestamp at time zone 'America/Sao_Paulo')
       where id = $2`,
      [await dayOffset(startOffset), participantId],
    );

    return participantId;
  }

  it('fecha um dia que o cron perdeu, quebrando o streak de quem não registrou nada', async () => {
    const participantId = await setupParticipant(-5);

    // Estado de quem vinha numa sequência e teve a noite de ontem perdida.
    await client.query('update challenge_participants set current_streak = 4, total_days_completed = 4 where id = $1', [
      participantId,
    ]);

    await client.query('select close_open_daily_periods(14)');

    const state = await participantState(client, participantId);
    // Sem registro naquele dia = 0/3 = streak quebrado (CLAUDE.md seção
    // "Cumprimento de metas"). Antes desta função, o dia ficava aberto para
    // sempre e o streak seguia intacto indevidamente.
    expect(state.current_streak).toBe(0);

    const { rows } = await client.query(
      'select closed from day_results where challenge_participant_id = $1 and result_date = $2::date',
      [participantId, await dayOffset(-1)],
    );
    expect(rows[0]).toMatchObject({ closed: true });
  });

  it('não reprocessa dia já fechado — rodar duas vezes não muda nada', async () => {
    const participantId = await setupParticipant(-5);
    await client.query('update challenge_participants set current_streak = 4 where id = $1', [participantId]);

    await client.query('select close_open_daily_periods(14)');
    const first = await participantState(client, participantId);

    await client.query('select close_open_daily_periods(14)');
    const second = await participantState(client, participantId);

    expect(second).toEqual(first);
  });

  // O caso que a função existe para NÃO estragar.
  it('pula o participante que já tem um dia posterior fechado, em vez de decidir fora de ordem', async () => {
    const participantId = await setupParticipant(-6);

    // Dia -3 ficou aberto (o cron falhou), mas -2 e -1 fecharam normalmente
    // e o participante está com streak 2.
    await seedClosedDay(participantId, await dayOffset(-2), true, 1);
    await seedClosedDay(participantId, await dayOffset(-1), true, 2);
    await client.query(
      'update challenge_participants set current_streak = 2, longest_streak = 2, total_days_completed = 2 where id = $1',
      [participantId],
    );

    await client.query('select close_open_daily_periods(14)');

    const state = await participantState(client, participantId);
    // Fechar o dia -3 agora zeraria um streak que já foi legitimamente
    // construído depois dele. A função tem de recuar.
    expect(state.current_streak).toBe(2);
    expect(state.total_days_completed).toBe(2);

    const { rows } = await client.query(
      'select closed from day_results where challenge_participant_id = $1 and result_date = $2::date',
      [participantId, await dayOffset(-3)],
    );
    // O dia continua em aberto — deliberadamente, para inspeção manual.
    expect(rows.length === 0 || rows[0].closed === false).toBe(true);
  });

  it('relata por data quantos foram fechados e quantos foram pulados', async () => {
    const participantId = await setupParticipant(-4);
    await seedClosedDay(participantId, await dayOffset(-1), true, 1);
    await client.query('update challenge_participants set current_streak = 1 where id = $1', [participantId]);

    const { rows } = await client.query<{
      closed_date: string;
      participants_closed: number;
      participants_skipped: number;
    }>('select * from close_open_daily_periods(14)');

    // Só reporta dias em que houve algo a fazer.
    for (const row of rows) {
      expect(Number(row.participants_closed) + Number(row.participants_skipped)).toBeGreaterThan(0);
    }
  });

  it('recusa uma janela de retrocesso fora do intervalo aceito', async () => {
    await expect(client.query('select close_open_daily_periods(0)')).rejects.toThrow(/p_lookback_days/);
    await expect(client.query('select close_open_daily_periods(91)')).rejects.toThrow(/p_lookback_days/);
  });

  it('nunca fecha o dia de hoje — quem fecha hoje é o check-in do participante', async () => {
    const participantId = await setupParticipant(-3);

    await client.query('select close_open_daily_periods(14)');

    const { rows } = await client.query(
      `select closed from day_results
       where challenge_participant_id = $1 and result_date = (now() at time zone 'America/Sao_Paulo')::date`,
      [participantId],
    );
    expect(rows.length === 0 || rows[0].closed === false).toBe(true);
  });

  it('ignora quem já saiu do desafio', async () => {
    const participantId = await setupParticipant(-4);
    await client.query("update challenge_participants set status = 'inactive' where id = $1", [participantId]);

    await client.query('select close_open_daily_periods(14)');

    const { rows } = await client.query('select count(*)::int as n from day_results where challenge_participant_id = $1', [
      participantId,
    ]);
    expect(rows[0].n).toBe(0);
  });
});
