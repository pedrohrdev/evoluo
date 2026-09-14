import type { Client } from 'pg';
import {
  addParticipant,
  connect,
  createChallenge,
  createGoal,
  createThreeDailyGoals,
  createUser,
  participantState,
  recordDaily,
  resetSchema,
} from './db';

/**
 * A lógica que decide o resultado do produto vive em SQL, não no NestJS:
 * `compute_daily_record_fields` decide se a meta foi cumprida e quantos
 * pontos vale, `enforce_daily_record_window` decide o que pode ser gravado,
 * `reconcile_daily_period` (trigger em cada INSERT/UPDATE de daily_records)
 * e `close_daily_period` decidem o streak.
 *
 * Nenhum teste unitário toca nisso (todos mockam o PrismaService). Estes
 * rodam as migrations de verdade.
 */
describe('regras no banco (integração)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect();
    await resetSchema(client);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  beforeEach(async () => {
    // Cada teste começa com as tabelas vazias, mas com o schema intacto.
    await client.query(
      `truncate points_ledger, day_results, daily_records, weekly_records, monthly_records,
       challenge_records, goal_versions, goals, special_goals, challenge_participants, challenges
       restart identity cascade`,
    );
    await client.query('delete from auth.users');
  });

  describe('cumprimento e pontos', () => {
    it('conta como cumprida a partir do alvo, sem proporcionalidade', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goal = await createGoal(client, participantId, { kind: 'hours', importance: 'high', targetValue: 5 });

      await recordDaily(client, goal, participantId, { actualValue: 3 });

      const below = await client.query('select completed, points_awarded from daily_records');
      expect(below.rows[0]).toMatchObject({ completed: false, points_awarded: 0 });
    });

    // O exemplo literal do enunciado do produto: 3h contra meta de 5h não
    // cumpre; 7h cumpre e NÃO ganha bônus pelo excedente.
    it('não dá bônus por exceder o alvo', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const exact = await createGoal(client, participantId, { kind: 'hours', importance: 'high', targetValue: 5 });
      const over = await createGoal(client, participantId, { kind: 'hours', importance: 'high', targetValue: 5 });

      await recordDaily(client, exact, participantId, { actualValue: 5 });
      await recordDaily(client, over, participantId, { actualValue: 7 });

      const { rows } = await client.query(
        'select actual_value, completed, points_awarded from daily_records order by actual_value',
      );
      expect(rows).toMatchObject([
        { completed: true, points_awarded: 30 },
        { completed: true, points_awarded: 30 },
      ]);
      // O valor real excedente continua salvo para analytics.
      expect(Number(rows[1].actual_value)).toBe(7);
    });

    it('usa a escala de points_config por importância', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);

      for (const importance of ['high', 'medium', 'low'] as const) {
        const goal = await createGoal(client, participantId, { kind: 'boolean', importance, targetValue: null });
        await recordDaily(client, goal, participantId, { actualBoolean: true });
      }

      const { rows } = await client.query(
        'select importance, points_awarded from daily_records order by points_awarded desc',
      );
      expect(rows).toMatchObject([
        { importance: 'high', points_awarded: 30 },
        { importance: 'medium', points_awarded: 20 },
        { importance: 'low', points_awarded: 10 },
      ]);
    });

    // O cliente não consegue forjar cumprimento nem pontos: o trigger
    // sobrescreve o que for enviado.
    it('ignora completed/points_awarded enviados pelo cliente', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goal = await createGoal(client, participantId, { kind: 'hours', importance: 'low', targetValue: 10 });

      await client.query(
        `insert into daily_records
           (goal_id, goal_version_id, challenge_participant_id, record_date, actual_value, kind, importance, completed, points_awarded)
         values ($1, $2, $3, (now() at time zone 'America/Sao_Paulo')::date, 1, 'hours', 'high', true, 9999)`,
        [goal.goalId, goal.versionId, participantId],
      );

      const { rows } = await client.query('select completed, points_awarded, importance from daily_records');
      expect(rows[0]).toMatchObject({ completed: false, points_awarded: 0, importance: 'low' });
    });
  });

  describe('janela de edição', () => {
    it('recusa registro em data que não seja hoje', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goal = await createGoal(client, participantId, { kind: 'boolean', targetValue: null });

      await expect(
        client.query(
          `insert into daily_records
             (goal_id, goal_version_id, challenge_participant_id, record_date, actual_boolean, kind, importance)
           values ($1, $2, $3, (now() at time zone 'America/Sao_Paulo')::date - 1, true, 'boolean', 'high')`,
          [goal.goalId, goal.versionId, participantId],
        ),
      ).rejects.toThrow(/só é possível registrar ou editar metas diárias do dia de hoje/);
    });
  });

  describe('check-in reativo (multi-registro no mesmo dia)', () => {
    // Regra revertida a pedido do usuário: check-in único por dia deixou de
    // existir. Cada meta diária é um upsert avulso (mesmo padrão de
    // semanal/mensal/desafio) e o trigger reconcile_daily_period decide
    // streak/pontos a cada INSERT/UPDATE em daily_records — sem nenhuma
    // chamada explícita de "fechar o dia".
    it('sobe o streak e credita os pontos assim que a 3ª meta bate no mesmo dia, sem nenhuma chamada extra', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goals = await createThreeDailyGoals(client, participantId);

      await recordDaily(client, goals[0], participantId, { actualBoolean: true });
      await recordDaily(client, goals[1], participantId, { actualBoolean: true });
      expect(await participantState(client, participantId)).toMatchObject({ current_streak: 0, total_points: 60 });

      // A 3ª meta, registrada minutos depois, é o que fecha o dia — não uma
      // chamada separada.
      await recordDaily(client, goals[2], participantId, { actualBoolean: true });

      expect(await participantState(client, participantId)).toMatchObject({
        current_streak: 1,
        longest_streak: 1,
        total_points: 90,
        total_days_completed: 1,
      });
    });

    it('mantém o streak zerado com 2 de 3, mas credita os pontos das metas cumpridas', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goals = await createThreeDailyGoals(client, participantId);

      await recordDaily(client, goals[0], participantId, { actualBoolean: true });
      await recordDaily(client, goals[1], participantId, { actualBoolean: true });
      await recordDaily(client, goals[2], participantId, { actualBoolean: false });

      expect(await participantState(client, participantId)).toMatchObject({
        current_streak: 0,
        total_points: 60,
        total_days_completed: 0,
      });
    });

    it('reverte o streak e revoga os pontos daquela meta quando uma correção derruba o dia de 3/3 para 2/3', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goals = await createThreeDailyGoals(client, participantId);

      for (const goal of goals) {
        await recordDaily(client, goal, participantId, { actualBoolean: true });
      }
      expect(await participantState(client, participantId)).toMatchObject({
        current_streak: 1,
        longest_streak: 1,
        total_points: 90,
        total_days_completed: 1,
      });

      // Participante corrige a 3ª meta pra "não" mais tarde no mesmo dia.
      await recordDaily(client, goals[2], participantId, { actualBoolean: false });

      expect(await participantState(client, participantId)).toMatchObject({
        current_streak: 0,
        // longest_streak é só informativo (CLAUDE.md seção "Streak") — o
        // pico já alcançado no dia não é apagado por uma correção depois.
        longest_streak: 1,
        // Só os 20 pontos da meta corrigida somem; as outras duas continuam
        // cumpridas.
        total_points: 60,
        total_days_completed: 0,
      });

      const { rows } = await client.query(
        `select count(*)::int as n from points_ledger pl
         join daily_records dr on dr.id = pl.source_record_id
         where dr.goal_id = $1`,
        [goals[2].goalId],
      );
      expect(rows[0].n).toBe(0);
    });

    it('re-credita o streak e os pontos se a meta corrigida for cumprida de novo no mesmo dia', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goals = await createThreeDailyGoals(client, participantId);

      for (const goal of goals) {
        await recordDaily(client, goal, participantId, { actualBoolean: true });
      }
      await recordDaily(client, goals[2], participantId, { actualBoolean: false }); // derruba pra 2/3
      await recordDaily(client, goals[2], participantId, { actualBoolean: true }); // corrige de volta

      expect(await participantState(client, participantId)).toMatchObject({
        current_streak: 1,
        longest_streak: 1,
        total_points: 90,
        total_days_completed: 1,
      });
    });

    it('day_results reflete o progresso do dia em tempo real, sem esperar o fechamento noturno', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goals = await createThreeDailyGoals(client, participantId);

      await recordDaily(client, goals[0], participantId, { actualBoolean: true });

      const { rows } = await client.query(
        `select completed_goals_count, day_completed, closed
         from day_results where challenge_participant_id = $1`,
        [participantId],
      );
      expect(rows[0]).toMatchObject({ completed_goals_count: 1, day_completed: false, closed: false });
    });
  });

  describe('fechamento noturno', () => {
    it('fecha como 0/3 quem não fez check-in e é idempotente', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user, { durationDays: 30, startDate: '2020-01-01' });
      // Um desafio que já terminou não é elegível; usa um em curso.
      await client.query('update challenges set start_date = current_date - 1');

      await client.query(`select close_daily_period((current_date - 1)::date)`);
      const first = await participantState(client, participantId);

      await client.query(`select close_daily_period((current_date - 1)::date)`);
      const second = await participantState(client, participantId);

      expect(first).toMatchObject({ current_streak: 0, total_days_completed: 0 });
      expect(second).toEqual(first);
    });

    // Etapa 23 (P1-5): entrar num desafio agendado gerava dias 0/3 no
    // histórico ANTES de o desafio existir.
    it('não fecha dias anteriores ao início do desafio', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user, { durationDays: 30 });
      await client.query('update challenges set start_date = current_date');

      await client.query(`select close_daily_period((current_date - 1)::date)`);

      const { rows } = await client.query('select count(*)::int as n from day_results where challenge_participant_id = $1', [
        participantId,
      ]);
      expect(rows[0].n).toBe(0);
    });

    // O caso que reconcile_daily_period + close_daily_period precisam
    // combinar sem dobrar nada: um dia que já foi decidido reativamente
    // (streak já aplicado a challenge_participants, day_results já existe)
    // vira "ontem" quando a noite chega — o job só precisa trancar, nunca
    // reaplicar o incremento.
    it('só tranca (não reaplica streak/pontos) um dia que já tinha sido decidido reativamente', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user, { durationDays: 30, startDate: '2020-01-01' });
      await client.query('update challenges set start_date = current_date - 1');
      // joined_at precisa ser anterior ao dia sendo fechado — o default
      // (now(), "hoje") excluiria o participante do loop de close_daily_period
      // por "ainda não tinha entrado" naquele dia.
      await client.query('update challenge_participants set joined_at = now() - interval \'1 day\' where id = $1', [
        participantId,
      ]);

      // Simula o que reconcile_daily_period já teria deixado para "ontem":
      // streak aplicado ao participante e day_results aberto (closed=false).
      await client.query(
        'update challenge_participants set current_streak = 1, longest_streak = 1, total_points = 90, total_days_completed = 1 where id = $1',
        [participantId],
      );
      await client.query(
        `insert into day_results (challenge_participant_id, result_date, completed_goals_count, day_completed, streak_after, closed)
         values ($1, current_date - 1, 3, true, 1, false)`,
        [participantId],
      );

      await client.query(`select close_daily_period((current_date - 1)::date)`);

      // Nada mudou nos agregados — só o trancamento.
      expect(await participantState(client, participantId)).toMatchObject({
        current_streak: 1,
        longest_streak: 1,
        total_points: 90,
        total_days_completed: 1,
      });
      const { rows } = await client.query(
        'select closed from day_results where challenge_participant_id = $1 and result_date = current_date - 1',
        [participantId],
      );
      expect(rows[0]).toMatchObject({ closed: true });
    });
  });

  describe('imutabilidade', () => {
    it('bloqueia alterar o conteúdo de uma versão de meta, mesmo como superusuário', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goal = await createGoal(client, participantId, { kind: 'hours', targetValue: 5 });

      await expect(
        client.query('update goal_versions set target_value = 1 where id = $1', [goal.versionId]),
      ).rejects.toThrow(/imutável/);
    });

    it('mantém o snapshot do registro quando a meta é editada depois', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      const goal = await createGoal(client, participantId, { kind: 'hours', importance: 'high', targetValue: 5 });
      await recordDaily(client, goal, participantId, { actualValue: 5 });

      // Fecha a versão e abre outra, como GoalsService.setVersion faz.
      await client.query('update goal_versions set valid_until = now() where id = $1', [goal.versionId]);
      await client.query(
        `insert into goal_versions (goal_id, kind, importance, title, target_value)
         values ($1, 'hours', 'low', 'Meta mais fácil', 1)`,
        [goal.goalId],
      );

      const { rows } = await client.query(
        'select target_value_snapshot, importance, completed, points_awarded from daily_records',
      );
      expect(Number(rows[0].target_value_snapshot)).toBe(5);
      expect(rows[0]).toMatchObject({ importance: 'high', completed: true, points_awarded: 30 });
    });

    it('nunca permite a 4ª meta diária', async () => {
      const user = await createUser(client, 'Ana');
      const { participantId } = await createChallenge(client, user);
      await createThreeDailyGoals(client, participantId);

      await expect(createGoal(client, participantId, { periodType: 'daily' })).rejects.toThrow(
        /no máximo 3 metas diárias/,
      );
    });
  });

  // Complementa a correção do job noturno (migration 20260912090000): aquela
  // impede CRIAR dias anteriores ao início; o filtro em RecordsService.getHistory
  // impede EXIBIR os que já existem. Este teste prova o cenário real que
  // apareceu em produção — 3 participantes com um dia 0/3 dois dias antes do
  // desafio começar.
  describe('dias anteriores ao início do desafio', () => {
    it('o job noturno não cria, e um já existente fica fora da janela de leitura', async () => {
      const user = await createUser(client, 'Ana');
      const { challengeId, participantId } = await createChallenge(client, user);
      await client.query('update challenges set start_date = current_date where id = $1', [challengeId]);

      // Simula a linha que o bug antigo deixou: ontem, antes do início.
      await client.query(
        `insert into day_results (challenge_participant_id, result_date, completed_goals_count, day_completed, streak_after, closed)
         values ($1, current_date - 1, 0, false, 0, true)`,
        [participantId],
      );

      // O job não acrescenta mais nenhuma (é o que a migration garante).
      await client.query(`select close_daily_period((current_date - 1)::date)`);
      const { rows: total } = await client.query(
        'select count(*)::int as n from day_results where challenge_participant_id = $1',
        [participantId],
      );
      expect(total[0].n).toBe(1);

      // E a consulta que a tela de histórico faz não devolve a antiga.
      const { rows: visiveis } = await client.query(
        `select count(*)::int as n
         from day_results dr
         join challenge_participants cp on cp.id = dr.challenge_participant_id
         join challenges c on c.id = cp.challenge_id
         where dr.challenge_participant_id = $1 and dr.closed = true and dr.result_date >= c.start_date`,
        [participantId],
      );
      expect(visiveis[0].n).toBe(0);
    });
  });

  describe('ranking', () => {
    it('ordena por streak, depois pontos, depois dias concluídos', async () => {
      const ana = await createUser(client, 'Ana');
      const bruno = await createUser(client, 'Bruno');
      const carla = await createUser(client, 'Carla');
      const { challengeId, participantId: anaId } = await createChallenge(client, ana);
      const brunoId = await addParticipant(client, challengeId, bruno);
      const carlaId = await addParticipant(client, challengeId, carla);

      // Escrita direta nos agregados só é possível aqui (superusuário) —
      // o cliente não tem GRANT nessas colunas, que é o ponto do desenho.
      await client.query('update challenge_participants set current_streak = 5, total_points = 100 where id = $1', [anaId]);
      await client.query('update challenge_participants set current_streak = 5, total_points = 300 where id = $1', [brunoId]);
      await client.query('update challenge_participants set current_streak = 9, total_points = 10 where id = $1', [carlaId]);

      const { rows } = await client.query(
        `select id from challenge_participants
         where challenge_id = $1 and status = 'active'
         order by current_streak desc, total_points desc, total_days_completed desc, id asc`,
        [challengeId],
      );

      expect(rows.map((r) => r.id)).toEqual([carlaId, brunoId, anaId]);
    });
  });
});
