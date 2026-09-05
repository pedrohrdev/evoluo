-- Registros reais lançados pelo participante. Um registro sempre referencia
-- uma goal_version_id específica (a vigente no momento do registro) e copia
-- dela os campos usados em analytics/exibição (kind, importance,
-- target_value_snapshot) — assim uma edição futura da meta nunca altera
-- registros já gravados, mesmo que a linha de goal_versions um dia suma.
--
-- completed e points_awarded NUNCA são gravados pelo cliente: são
-- calculados pelos triggers compute_*_record_fields a partir do
-- goal_version + points_config, sobrescrevendo qualquer valor que o
-- cliente tente enviar. "Fazer mais que o necessário não gera pontos
-- extras" é garantido aqui (completed é booleano, não proporcional).
--
-- Só é possível inserir/editar um registro do período AINDA vigente
-- (hoje, para daily; a semana/mês/desafio em curso, para os demais) —
-- trigger enforce_*_record_window. Depois que o período fecha, o registro
-- passa a ser gravado somente pelas funções de fechamento (que também são
-- as únicas a escrever em points_ledger e a atualizar streak/pontos em
-- challenge_participants).

create table daily_records (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals (id),
  goal_version_id uuid not null references goal_versions (id),
  challenge_participant_id uuid not null references challenge_participants (id) on delete cascade,
  record_date date not null,
  actual_value numeric(10, 2),
  actual_boolean boolean,
  kind goal_kind not null,
  importance importance_level not null,
  target_value_snapshot numeric(10, 2),
  completed boolean not null default false,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, record_date)
);

create table weekly_records (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals (id),
  goal_version_id uuid not null references goal_versions (id),
  challenge_participant_id uuid not null references challenge_participants (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  actual_value numeric(10, 2),
  actual_boolean boolean,
  kind goal_kind not null,
  importance importance_level not null,
  target_value_snapshot numeric(10, 2),
  completed boolean not null default false,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, period_start),
  check (period_end > period_start)
);

create table monthly_records (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals (id),
  goal_version_id uuid not null references goal_versions (id),
  challenge_participant_id uuid not null references challenge_participants (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  actual_value numeric(10, 2),
  actual_boolean boolean,
  kind goal_kind not null,
  importance importance_level not null,
  target_value_snapshot numeric(10, 2),
  completed boolean not null default false,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, period_start),
  check (period_end > period_start)
);

create table challenge_records (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals (id),
  goal_version_id uuid not null references goal_versions (id),
  challenge_participant_id uuid not null references challenge_participants (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  actual_value numeric(10, 2),
  actual_boolean boolean,
  kind goal_kind not null,
  importance importance_level not null,
  target_value_snapshot numeric(10, 2),
  completed boolean not null default false,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- só existe uma meta de desafio por participante (índice único em goals),
  -- então só existe um período possível por goal — a unicidade em goal_id
  -- sozinha já basta.
  unique (goal_id),
  check (period_end > period_start)
);

create index daily_records_participant_date_idx on daily_records (challenge_participant_id, record_date);
create index weekly_records_participant_idx on weekly_records (challenge_participant_id, period_start);
create index monthly_records_participant_idx on monthly_records (challenge_participant_id, period_start);
create index challenge_records_participant_idx on challenge_records (challenge_participant_id);

-- ---------------------------------------------------------------------
-- Cálculo dos campos derivados (kind/importance/target snapshot,
-- completed, points_awarded), a partir do goal_version referenciado.
-- ---------------------------------------------------------------------

create or replace function compute_daily_record_fields() returns trigger as $$
declare
  gv goal_versions%rowtype;
  g goals%rowtype;
  cfg_points integer;
begin
  select * into gv from goal_versions where id = new.goal_version_id;
  if not found then
    raise exception 'goal_version_id inválido (%)', new.goal_version_id;
  end if;
  if gv.goal_id <> new.goal_id then
    raise exception 'goal_version_id não pertence à goal_id informada';
  end if;

  select * into g from goals where id = new.goal_id;
  if g.period_type <> 'daily' then
    raise exception 'goal % não é uma meta diária (period_type=%)', new.goal_id, g.period_type;
  end if;

  new.kind := gv.kind;
  new.importance := gv.importance;
  new.target_value_snapshot := gv.target_value;

  if gv.kind = 'boolean' then
    if new.actual_boolean is null then
      raise exception 'actual_boolean é obrigatório para metas do tipo boolean';
    end if;
    new.actual_value := null;
    new.completed := new.actual_boolean;
  else
    if new.actual_value is null then
      raise exception 'actual_value é obrigatório para metas do tipo %', gv.kind;
    end if;
    new.actual_boolean := null;
    new.completed := (new.actual_value >= gv.target_value);
  end if;

  if new.completed then
    select points into cfg_points from points_config
      where importance = gv.importance and period_type = 'daily';
    new.points_awarded := coalesce(cfg_points, 0);
  else
    new.points_awarded := 0;
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create or replace function compute_period_record_fields() returns trigger as $$
declare
  gv goal_versions%rowtype;
  g goals%rowtype;
  cfg_points integer;
  v_period_type goal_period;
begin
  case tg_table_name
    when 'weekly_records' then v_period_type := 'weekly';
    when 'monthly_records' then v_period_type := 'monthly';
    when 'challenge_records' then v_period_type := 'challenge';
    else raise exception 'compute_period_record_fields chamado em tabela inesperada: %', tg_table_name;
  end case;

  select * into gv from goal_versions where id = new.goal_version_id;
  if not found then
    raise exception 'goal_version_id inválido (%)', new.goal_version_id;
  end if;
  if gv.goal_id <> new.goal_id then
    raise exception 'goal_version_id não pertence à goal_id informada';
  end if;

  select * into g from goals where id = new.goal_id;
  if g.period_type <> v_period_type then
    raise exception 'goal % não é uma meta do tipo % (period_type=%)', new.goal_id, v_period_type, g.period_type;
  end if;

  new.kind := gv.kind;
  new.importance := gv.importance;
  new.target_value_snapshot := gv.target_value;

  if gv.kind = 'boolean' then
    if new.actual_boolean is null then
      raise exception 'actual_boolean é obrigatório para metas do tipo boolean';
    end if;
    new.actual_value := null;
    new.completed := new.actual_boolean;
  else
    if new.actual_value is null then
      raise exception 'actual_value é obrigatório para metas do tipo %', gv.kind;
    end if;
    new.actual_boolean := null;
    new.completed := (new.actual_value >= gv.target_value);
  end if;

  if new.completed then
    select points into cfg_points from points_config
      where importance = gv.importance and period_type = v_period_type;
    new.points_awarded := coalesce(cfg_points, 0);
  else
    new.points_awarded := 0;
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- Janela de edição: só o período ainda vigente pode ser gravado/alterado.
-- Fuso fixo do servidor (America/Sao_Paulo) — decisão confirmada em
-- docs/arquitetura-tecnica.md, seção 2.
-- ---------------------------------------------------------------------

create or replace function enforce_daily_record_window() returns trigger as $$
begin
  if new.record_date <> (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'só é possível registrar ou editar metas diárias do dia de hoje (fuso America/Sao_Paulo); tentativa para %', new.record_date;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function enforce_period_record_window() returns trigger as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if today < new.period_start or today > new.period_end then
    raise exception 'só é possível registrar ou editar esta meta dentro do período vigente (% a %); hoje é %', new.period_start, new.period_end, today;
  end if;
  return new;
end;
$$ language plpgsql;

-- Prefixo numérico garante a ordem de execução dos triggers BEFORE
-- (Postgres dispara na ordem alfabética do nome): checar a janela antes de
-- calcular os campos.
create trigger trg_10_enforce_daily_record_window
before insert or update on daily_records
for each row execute function enforce_daily_record_window();

create trigger trg_20_compute_daily_record_fields
before insert or update on daily_records
for each row execute function compute_daily_record_fields();

create trigger trg_10_enforce_weekly_record_window
before insert or update on weekly_records
for each row execute function enforce_period_record_window();

create trigger trg_20_compute_weekly_record_fields
before insert or update on weekly_records
for each row execute function compute_period_record_fields();

create trigger trg_10_enforce_monthly_record_window
before insert or update on monthly_records
for each row execute function enforce_period_record_window();

create trigger trg_20_compute_monthly_record_fields
before insert or update on monthly_records
for each row execute function compute_period_record_fields();

create trigger trg_10_enforce_challenge_record_window
before insert or update on challenge_records
for each row execute function enforce_period_record_window();

create trigger trg_20_compute_challenge_record_fields
before insert or update on challenge_records
for each row execute function compute_period_record_fields();

-- ---------------------------------------------------------------------
-- RLS: leitura pública, escrita restrita ao dono do registro, e mesmo o
-- dono só grava as colunas de entrada (actual_value/actual_boolean) — os
-- campos calculados (kind/importance/target_value_snapshot/completed/
-- points_awarded) não têm GRANT de insert/update para authenticated, então
-- o trigger é o único jeito de eles receberem valor, não importa o que o
-- cliente envie.
-- ---------------------------------------------------------------------

alter table daily_records enable row level security;
alter table weekly_records enable row level security;
alter table monthly_records enable row level security;
alter table challenge_records enable row level security;

create policy daily_records_select_authenticated on daily_records for select to authenticated using (true);
create policy weekly_records_select_authenticated on weekly_records for select to authenticated using (true);
create policy monthly_records_select_authenticated on monthly_records for select to authenticated using (true);
create policy challenge_records_select_authenticated on challenge_records for select to authenticated using (true);

revoke insert, update on daily_records from authenticated;
grant insert (goal_id, goal_version_id, challenge_participant_id, record_date, actual_value, actual_boolean) on daily_records to authenticated;
grant update (actual_value, actual_boolean) on daily_records to authenticated;

revoke insert, update on weekly_records from authenticated;
grant insert (goal_id, goal_version_id, challenge_participant_id, period_start, period_end, actual_value, actual_boolean) on weekly_records to authenticated;
grant update (actual_value, actual_boolean) on weekly_records to authenticated;

revoke insert, update on monthly_records from authenticated;
grant insert (goal_id, goal_version_id, challenge_participant_id, period_start, period_end, actual_value, actual_boolean) on monthly_records to authenticated;
grant update (actual_value, actual_boolean) on monthly_records to authenticated;

revoke insert, update on challenge_records from authenticated;
grant insert (goal_id, goal_version_id, challenge_participant_id, period_start, period_end, actual_value, actual_boolean) on challenge_records to authenticated;
grant update (actual_value, actual_boolean) on challenge_records to authenticated;

create policy daily_records_write_own on daily_records for insert to authenticated
  with check (exists (select 1 from challenge_participants cp where cp.id = daily_records.challenge_participant_id and cp.user_id = auth.uid()));
create policy daily_records_update_own on daily_records for update to authenticated
  using (exists (select 1 from challenge_participants cp where cp.id = daily_records.challenge_participant_id and cp.user_id = auth.uid()));

create policy weekly_records_write_own on weekly_records for insert to authenticated
  with check (exists (select 1 from challenge_participants cp where cp.id = weekly_records.challenge_participant_id and cp.user_id = auth.uid()));
create policy weekly_records_update_own on weekly_records for update to authenticated
  using (exists (select 1 from challenge_participants cp where cp.id = weekly_records.challenge_participant_id and cp.user_id = auth.uid()));

create policy monthly_records_write_own on monthly_records for insert to authenticated
  with check (exists (select 1 from challenge_participants cp where cp.id = monthly_records.challenge_participant_id and cp.user_id = auth.uid()));
create policy monthly_records_update_own on monthly_records for update to authenticated
  using (exists (select 1 from challenge_participants cp where cp.id = monthly_records.challenge_participant_id and cp.user_id = auth.uid()));

create policy challenge_records_write_own on challenge_records for insert to authenticated
  with check (exists (select 1 from challenge_participants cp where cp.id = challenge_records.challenge_participant_id and cp.user_id = auth.uid()));
create policy challenge_records_update_own on challenge_records for update to authenticated
  using (exists (select 1 from challenge_participants cp where cp.id = challenge_records.challenge_participant_id and cp.user_id = auth.uid()));

-- Sem policy de delete em nenhuma das quatro tabelas: apagar um registro
-- histórico não é uma operação suportada nesta fase.
