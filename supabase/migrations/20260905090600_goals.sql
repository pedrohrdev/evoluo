-- Metas. Separadas em duas tabelas para permitir versionamento sem nunca
-- alterar retroativamente o histórico (docs/arquitetura-tecnica.md, seção 4):
--
--   goals          identidade estável da meta (a que participante pertence,
--                  qual periodicidade) — nunca muda depois de criada.
--   goal_versions  conteúdo em cada momento (tipo, importância, título,
--                  valor-alvo). Editar uma meta = fechar a versão vigente
--                  e abrir uma nova, nunca fazer UPDATE no conteúdo de uma
--                  versão existente.
--
-- Registros (daily_records etc.) sempre referenciam uma goal_version_id
-- específica, nunca só a goal — por isso o histórico nunca muda mesmo que
-- a meta seja editada depois.

create table goals (
  id uuid primary key default gen_random_uuid(),
  challenge_participant_id uuid not null references challenge_participants (id) on delete cascade,
  period_type goal_period not null,
  created_at timestamptz not null default now()
);

create index goals_challenge_participant_id_idx on goals (challenge_participant_id);

-- No máximo 1 meta semanal, 1 mensal e 1 de desafio por participante
-- (todas opcionais — zero é permitido). Isso é uma restrição real de
-- unicidade, não precisa de trigger.
create unique index goals_one_weekly_per_participant
  on goals (challenge_participant_id) where period_type = 'weekly';
create unique index goals_one_monthly_per_participant
  on goals (challenge_participant_id) where period_type = 'monthly';
create unique index goals_one_challenge_per_participant
  on goals (challenge_participant_id) where period_type = 'challenge';

-- Metas diárias: exatamente 3 é a regra de negócio, mas "exatamente 3 o
-- tempo todo, inclusive durante a configuração inicial" não é representável
-- como constraint estática. O banco garante o teto (nunca mais que 3) via
-- trigger; a aplicação garante o piso (bloquear o desafio como "não
-- configurado" até as 3 existirem) — ver docs/database-schema.md.
create or replace function enforce_daily_goal_limit() returns trigger as $$
declare
  current_count integer;
begin
  if new.period_type = 'daily' then
    select count(*) into current_count
    from goals
    where challenge_participant_id = new.challenge_participant_id
      and period_type = 'daily';

    if current_count >= 3 then
      raise exception 'cada participante pode ter no máximo 3 metas diárias (challenge_participant_id=%)', new.challenge_participant_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_daily_goal_limit
before insert on goals
for each row execute function enforce_daily_goal_limit();

create table goal_versions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals (id) on delete cascade,
  kind goal_kind not null,
  importance importance_level not null,
  title text not null,
  target_value numeric(10, 2),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_target_value_matches_kind check (
    (kind = 'boolean' and target_value is null)
    or (kind in ('hours', 'quantity') and target_value is not null and target_value > 0)
  )
);

comment on table goal_versions is 'Append-only por design: ver triggers trg_prevent_goal_version_mutation e trg_prevent_goal_version_delete. Nunca faça UPDATE/DELETE manual aqui — use a função set_goal_version().';

-- No máximo uma versão "aberta" (valid_until is null) por meta.
create unique index goal_versions_current_idx on goal_versions (goal_id) where valid_until is null;
create index goal_versions_goal_id_idx on goal_versions (goal_id);

-- Imutabilidade real, não só de convenção: qualquer tentativa de alterar o
-- conteúdo de uma versão já gravada (inclusive reabrir uma já fechada)
-- falha aqui, não importa por qual caminho a escrita chegou.
create or replace function prevent_goal_version_mutation() returns trigger as $$
begin
  if old.valid_until is not null then
    raise exception 'esta versão da meta já está fechada e não pode ser alterada nem reaberta (goal_version_id=%)', old.id;
  end if;
  if old.kind is distinct from new.kind
     or old.importance is distinct from new.importance
     or old.title is distinct from new.title
     or old.target_value is distinct from new.target_value
     or old.valid_from is distinct from new.valid_from
     or old.goal_id is distinct from new.goal_id then
    raise exception 'goal_versions é imutável: apenas o fechamento de vigência (valid_until) pode ser gravado, uma única vez (goal_version_id=%)', old.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_prevent_goal_version_mutation
before update on goal_versions
for each row execute function prevent_goal_version_mutation();

create or replace function prevent_goal_version_delete() returns trigger as $$
begin
  raise exception 'goal_versions nunca pode ser apagado (histórico imutável, goal_version_id=%)', old.id;
end;
$$ language plpgsql;

create trigger trg_prevent_goal_version_delete
before delete on goal_versions
for each row execute function prevent_goal_version_delete();

alter table goals enable row level security;
alter table goal_versions enable row level security;

create policy goals_select_authenticated
  on goals for select
  to authenticated
  using (true);

-- Criar uma goal só é permitido para o dono do challenge_participant, e só
-- period_type é gravável (o resto tem default). O teto de contagem é
-- garantido pelo trigger acima e pelos índices únicos.
revoke insert on goals from authenticated;
grant insert (challenge_participant_id, period_type) on goals to authenticated;

create policy goals_insert_own
  on goals for insert
  to authenticated
  with check (
    exists (
      select 1 from challenge_participants cp
      where cp.id = goals.challenge_participant_id and cp.user_id = auth.uid()
    )
  );

-- Sem policy de update/delete para goals: a "identidade" da meta não muda
-- depois de criada; o que muda é a versão (goal_versions), e isso passa
-- exclusivamente pela função set_goal_version() abaixo.

create policy goal_versions_select_authenticated
  on goal_versions for select
  to authenticated
  using (true);

-- Nenhuma policy de insert/update/delete para goal_versions: toda escrita
-- passa pela função set_goal_version() (security definer), que valida o
-- dono e faz a transição fechar-versão-antiga/abrir-versão-nova de forma
-- atômica. Isso evita que o cliente insira uma "primeira versão" avulsa que
-- não fecha nenhuma anterior, ou dispare os triggers de imutabilidade por
-- engano.
create or replace function set_goal_version(
  p_goal_id uuid,
  p_kind goal_kind,
  p_importance importance_level,
  p_title text,
  p_target_value numeric
) returns goal_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_new goal_versions;
begin
  select cp.user_id into v_owner
  from goals g
  join challenge_participants cp on cp.id = g.challenge_participant_id
  where g.id = p_goal_id;

  if v_owner is null then
    raise exception 'goal % não encontrada', p_goal_id;
  end if;

  if v_owner <> auth.uid() then
    raise exception 'sem permissão para editar esta meta';
  end if;

  update goal_versions
    set valid_until = now()
    where goal_id = p_goal_id and valid_until is null;

  insert into goal_versions (goal_id, kind, importance, title, target_value)
  values (p_goal_id, p_kind, p_importance, p_title, p_target_value)
  returning * into v_new;

  return v_new;
end;
$$;

grant execute on function set_goal_version(uuid, goal_kind, importance_level, text, numeric) to authenticated;
