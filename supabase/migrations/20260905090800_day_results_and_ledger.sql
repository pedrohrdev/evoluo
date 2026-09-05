-- day_results: 1 linha por participante por dia, com quantas das 3 metas
-- diárias foram cumpridas. Existe para não recalcular a regra do streak a
-- cada leitura (docs/arquitetura-tecnica.md, seção 5).
--
-- Durante o dia, é atualizada de forma "tentativa" a cada INSERT/UPDATE em
-- daily_records (trigger upsert_day_result), só para refletir o progresso
-- do dia em andamento (ex.: "2/3 hoje"). O valor definitivo — e a decisão
-- de streak — só é gravado por close_daily_period(), uma única vez, depois
-- que o dia vira passado e não pode mais ser editado (closed = true).
--
-- points_ledger: lançamento append-only de pontos. Nunca é atualizado nem
-- apagado, só inserido pelas funções de fechamento — é o que permite
-- auditar de onde vieram os pontos e recalcular o total se algo divergir.
--
-- Nenhuma das duas tem policy de insert/update/delete para authenticated:
-- por padrão do RLS, sem policy = sem acesso. Só as funções security
-- definer abaixo (que rodam como o dono das funções, não como o usuário)
-- conseguem escrever aqui.

create table day_results (
  id uuid primary key default gen_random_uuid(),
  challenge_participant_id uuid not null references challenge_participants (id) on delete cascade,
  result_date date not null,
  completed_goals_count integer not null default 0,
  day_completed boolean not null default false,
  streak_after integer,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_participant_id, result_date)
);

comment on column day_results.closed is 'true depois que close_daily_period() processou este dia. Usado para tornar o fechamento idempotente (rodar o job de novo não soma streak/pontos em dobro).';

create index day_results_participant_idx on day_results (challenge_participant_id, result_date);
-- Suporta a busca de dias ainda não fechados feita pelo cron.
create index day_results_unclosed_idx on day_results (result_date) where closed = false;

create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  challenge_participant_id uuid not null references challenge_participants (id) on delete cascade,
  source_table text not null check (source_table in ('daily_records', 'weekly_records', 'monthly_records', 'challenge_records')),
  source_record_id uuid not null,
  points integer not null check (points >= 0),
  awarded_for_date date not null,
  created_at timestamptz not null default now(),
  -- garante que o mesmo registro nunca gera dois lançamentos de pontos,
  -- mesmo que uma função de fechamento seja executada mais de uma vez.
  unique (source_table, source_record_id)
);

create index points_ledger_participant_idx on points_ledger (challenge_participant_id);

-- Atualização "tentativa" de day_results a cada escrita em daily_records,
-- só para exibição em tempo real (ex.: barra de progresso "2/3 hoje").
-- security definer porque o participante não tem (e não deve ter) GRANT
-- direto de insert/update em day_results.
create or replace function upsert_day_result() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from daily_records
  where challenge_participant_id = new.challenge_participant_id
    and record_date = new.record_date
    and completed = true;

  insert into day_results (challenge_participant_id, result_date, completed_goals_count, day_completed, updated_at)
  values (new.challenge_participant_id, new.record_date, v_count, v_count >= 3, now())
  on conflict (challenge_participant_id, result_date)
  do update set
    completed_goals_count = excluded.completed_goals_count,
    day_completed = excluded.day_completed,
    updated_at = now()
  where day_results.closed = false;
  -- "where closed = false" é uma segunda trava: mesmo que por algum bug o
  -- trigger de janela deixasse passar uma escrita fora do dia vigente, este
  -- upsert nunca reabre um day_results já fechado.

  return new;
end;
$$;

create trigger trg_30_upsert_day_result
after insert or update on daily_records
for each row execute function upsert_day_result();

alter table day_results enable row level security;
alter table points_ledger enable row level security;

create policy day_results_select_authenticated
  on day_results for select
  to authenticated
  using (true);

create policy points_ledger_select_authenticated
  on points_ledger for select
  to authenticated
  using (true);

-- Sem nenhuma policy de insert/update/delete nas duas tabelas: o default
-- do RLS é negar, então authenticated não escreve aqui por nenhum caminho
-- além das funções security definer.
