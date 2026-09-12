import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(__dirname, '../../../../supabase/migrations');
const SHIM = join(__dirname, 'supabase-shim.sql');

/**
 * Base descartável com o schema REAL aplicado.
 *
 * Por que isto existe: cumprimento de meta, pontuação, streak, janela de
 * edição e imutabilidade do histórico são decididos por triggers e funções
 * do Postgres, não pelo NestJS. Os testes unitários (com PrismaService
 * mockado) verificam que a aplicação monta a consulta certa — e não tocam em
 * uma linha da lógica que realmente decide o resultado. Estes testes rodam
 * as migrations de verdade e exercitam o SQL.
 *
 * Nunca aponta para produção: exige `DATABASE_URL_TEST`, separada da
 * `DATABASE_URL` da aplicação, e recria o schema `public` do zero a cada
 * execução.
 */
export async function connect(): Promise<Client> {
  const connectionString = process.env.DATABASE_URL_TEST;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL_TEST não definida. Os testes de integração precisam de um Postgres descartável — ver README.',
    );
  }

  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

/** Aplica shim + todas as migrations, na ordem, numa base limpa. */
export async function resetSchema(client: Client): Promise<void> {
  // Recria do zero: um teste nunca herda estado de outro.
  await client.query('drop schema if exists public cascade');
  await client.query('drop schema if exists auth cascade');
  await client.query('drop schema if exists storage cascade');
  await client.query('drop schema if exists cron cascade');
  await client.query('create schema public');

  await client.query(readFileSync(SHIM, 'utf8'));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      // pg_cron não existe aqui; o stub do shim cobre cron.schedule.
      .replace(/create extension if not exists pg_cron;/g, '');

    try {
      await client.query(sql);
    } catch (error) {
      throw new Error(`Falha aplicando ${file}: ${String(error)}`);
    }
  }
}

/** Usuário + perfil, pelo mesmo caminho da aplicação (trigger de signup). */
export async function createUser(client: Client, displayName: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('display_name', $2::text))
     returning id`,
    [`${displayName.toLowerCase()}@test.dev`, displayName],
  );
  return rows[0].id;
}

export interface SeededChallenge {
  challengeId: string;
  participantId: string;
}

export async function createChallenge(
  client: Client,
  createdBy: string,
  options: { durationDays?: number; startDate?: string } = {},
): Promise<SeededChallenge> {
  const { durationDays = 30, startDate = 'current_date' } = options;

  const { rows } = await client.query<{ id: string }>(
    `insert into challenges (name, duration_days, start_date, created_by)
     values ('Desafio de teste', $1, ${startDate === 'current_date' ? 'current_date' : '$2::date'}, $${
       startDate === 'current_date' ? 2 : 3
     })
     returning id`,
    startDate === 'current_date' ? [durationDays, createdBy] : [durationDays, startDate, createdBy],
  );

  const challengeId = rows[0].id;
  const participantId = await addParticipant(client, challengeId, createdBy);
  return { challengeId, participantId };
}

export async function addParticipant(client: Client, challengeId: string, userId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'insert into challenge_participants (challenge_id, user_id) values ($1, $2) returning id',
    [challengeId, userId],
  );
  return rows[0].id;
}

/** Meta + primeira versão, como GoalsService.create faz. */
export async function createGoal(
  client: Client,
  participantId: string,
  options: {
    periodType?: 'daily' | 'weekly' | 'monthly' | 'challenge';
    kind?: 'hours' | 'quantity' | 'boolean';
    importance?: 'low' | 'medium' | 'high';
    title?: string;
    targetValue?: number | null;
  } = {},
): Promise<{ goalId: string; versionId: string }> {
  const {
    periodType = 'daily',
    kind = 'hours',
    importance = 'high',
    title = 'Meta de teste',
    targetValue = kind === 'boolean' ? null : 2,
  } = options;

  const { rows: goalRows } = await client.query<{ id: string }>(
    'insert into goals (challenge_participant_id, period_type) values ($1, $2) returning id',
    [participantId, periodType],
  );
  const goalId = goalRows[0].id;

  const { rows: versionRows } = await client.query<{ id: string }>(
    `insert into goal_versions (goal_id, kind, importance, title, target_value)
     values ($1, $2, $3, $4, $5) returning id`,
    [goalId, kind, importance, title, targetValue],
  );

  return { goalId, versionId: versionRows[0].id };
}

/** Três metas diárias — o mínimo para um dia poder fechar 3/3. */
export async function createThreeDailyGoals(
  client: Client,
  participantId: string,
  importance: 'low' | 'medium' | 'high' = 'high',
): Promise<{ goalId: string; versionId: string }[]> {
  return Promise.all(
    [1, 2, 3].map((n) =>
      createGoal(client, participantId, { kind: 'boolean', importance, title: `Meta ${n}`, targetValue: null }),
    ),
  );
}

export async function recordDaily(
  client: Client,
  goal: { goalId: string; versionId: string },
  participantId: string,
  value: { actualValue?: number; actualBoolean?: boolean },
): Promise<void> {
  await client.query(
    `insert into daily_records
       (goal_id, goal_version_id, challenge_participant_id, record_date, actual_value, actual_boolean, kind, importance)
     values ($1, $2, $3, (now() at time zone 'America/Sao_Paulo')::date, $4, $5, 'hours', 'high')`,
    [goal.goalId, goal.versionId, participantId, value.actualValue ?? null, value.actualBoolean ?? null],
  );
}

export async function participantState(client: Client, participantId: string) {
  const { rows } = await client.query(
    `select current_streak, longest_streak, total_points, total_days_completed
     from challenge_participants where id = $1`,
    [participantId],
  );
  return rows[0] as {
    current_streak: number;
    longest_streak: number;
    total_points: number;
    total_days_completed: number;
  };
}
