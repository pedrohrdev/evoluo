-- Meta especial: um participante atribui, a qualquer momento, uma tarefa
-- avulsa a outro participante do MESMO desafio. Decisão de negócio nova,
-- confirmada com o usuário em conversa (não fazia parte do modelo original
-- de metas em docs/arquitetura-tecnica.md) — registrada agora em
-- docs/arquitetura-tecnica.md e CLAUDE.md:
--
--   - aplicada direto, sem aceite do alvo;
--   - sempre tipo sim/não (cumpriu ou não), sem prazo fixo — "a qualquer
--     hora" dentro do desafio;
--   - puramente social: NUNCA gera pontos, nunca afeta streak nem ranking;
--   - quem criou pode cancelar enquanto pendente; sem limite de metas
--     especiais simultâneas por participante;
--   - pública dentro do desafio, como as demais metas/histórico (CLAUDE.md
--     seção 2 "Perfis").
--
-- Sem versionamento (diferente de goals/goal_versions): é um registro
-- único, não editável, que só transita pending -> completed (pelo alvo) ou
-- pending -> cancelled (por quem criou). Por isso nem "goal" nem
-- "goal_version" — é sua própria tabela, fora do padrão de period_type.

create type special_goal_status as enum ('pending', 'completed', 'cancelled');

create table special_goals (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  from_participant_id uuid not null references challenge_participants (id) on delete cascade,
  to_participant_id uuid not null references challenge_participants (id) on delete cascade,
  title text not null,
  status special_goal_status not null default 'pending',
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_special_goal_not_self check (from_participant_id <> to_participant_id),
  constraint chk_special_goal_title_length check (char_length(title) between 1 and 120)
);

create index special_goals_challenge_id_idx on special_goals (challenge_id);
create index special_goals_from_participant_id_idx on special_goals (from_participant_id);
create index special_goals_to_participant_id_idx on special_goals (to_participant_id);

comment on table special_goals is 'Tarefa avulsa entre dois participantes do mesmo desafio. Puramente social: nunca entra em points_ledger, day_results, nem em qualquer critério de ranking. Ver CLAUDE.md seção 2 "Outras regras já confirmadas".';

-- Garante, mesmo por fora do RLS (ex.: role postgres usada pelo NestJS —
-- docs/database-schema.md "Sobre NestJS e RLS"), que os dois participantes
-- pertencem ao mesmo desafio informado, e que o desafio já começou.
create or replace function enforce_special_goal_same_challenge() returns trigger as $$
declare
  v_from_challenge uuid;
  v_to_challenge uuid;
begin
  select challenge_id into v_from_challenge from challenge_participants where id = new.from_participant_id;
  select challenge_id into v_to_challenge from challenge_participants where id = new.to_participant_id;

  if v_from_challenge is null or v_to_challenge is null then
    raise exception 'participante não encontrado para a meta especial';
  end if;

  if v_from_challenge <> new.challenge_id or v_to_challenge <> new.challenge_id then
    raise exception 'os dois participantes de uma meta especial precisam pertencer ao desafio informado (challenge_id=%)', new.challenge_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_special_goal_same_challenge
before insert on special_goals
for each row execute function enforce_special_goal_same_challenge();

-- Imutabilidade da transição de status: uma vez completed/cancelled, a
-- linha nunca muda mais (histórico público estável, mesmo padrão de
-- goal_versions). De pending só é permitido ir para completed (com
-- completed_at) ou cancelled (com cancelled_at), nunca alterar title ou os
-- participantes. Vale para qualquer role, inclusive postgres.
create or replace function enforce_special_goal_transition() returns trigger as $$
begin
  if old.status <> 'pending' then
    raise exception 'esta meta especial já foi % e não pode mais ser alterada (special_goal_id=%)', old.status, old.id;
  end if;

  if old.challenge_id is distinct from new.challenge_id
     or old.from_participant_id is distinct from new.from_participant_id
     or old.to_participant_id is distinct from new.to_participant_id
     or old.title is distinct from new.title
     or old.created_at is distinct from new.created_at then
    raise exception 'special_goals: apenas a transição de status é permitida (special_goal_id=%)', old.id;
  end if;

  if new.status = 'completed' and new.completed_at is null then
    raise exception 'completed_at é obrigatório ao concluir uma meta especial (special_goal_id=%)', old.id;
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    raise exception 'cancelled_at é obrigatório ao cancelar uma meta especial (special_goal_id=%)', old.id;
  end if;

  if new.status not in ('completed', 'cancelled') then
    raise exception 'special_goals: transição de status inválida (de % para %, special_goal_id=%)', old.status, new.status, old.id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_special_goal_transition
before update on special_goals
for each row execute function enforce_special_goal_transition();

create or replace function prevent_special_goal_delete() returns trigger as $$
begin
  raise exception 'special_goals nunca pode ser apagado (histórico imutável, special_goal_id=%)', old.id;
end;
$$ language plpgsql;

create trigger trg_prevent_special_goal_delete
before delete on special_goals
for each row execute function prevent_special_goal_delete();

alter table special_goals enable row level security;

-- Pública dentro do app para qualquer autenticado, como as demais metas
-- (CLAUDE.md seção 2 "Perfis") — sem exigir que o leitor participe do
-- mesmo desafio.
create policy special_goals_select_authenticated
  on special_goals for select
  to authenticated
  using (true);

-- Só o dono do from_participant pode criar, e só title/challenge/
-- participantes são graváveis (status/completed_at/cancelled_at têm
-- default e só mudam via update, nunca no insert).
revoke insert on special_goals from authenticated;
grant insert (challenge_id, from_participant_id, to_participant_id, title) on special_goals to authenticated;

create policy special_goals_insert_own
  on special_goals for insert
  to authenticated
  with check (
    exists (
      select 1 from challenge_participants cp
      where cp.id = special_goals.from_participant_id and cp.user_id = auth.uid()
    )
  );

-- Duas transições possíveis, cada uma só pelo lado certo: o alvo conclui, quem
-- criou cancela. Ambas restritas a partir de status = 'pending' (o trigger
-- de imutabilidade acima é quem realmente barra qualquer outra tentativa,
-- isto aqui só evita que a policy autorize um update que o trigger rejeitaria).
revoke update on special_goals from authenticated;
grant update (status, completed_at) on special_goals to authenticated;
grant update (status, cancelled_at) on special_goals to authenticated;

create policy special_goals_complete_own
  on special_goals for update
  to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from challenge_participants cp
      where cp.id = special_goals.to_participant_id and cp.user_id = auth.uid()
    )
  )
  with check (status = 'completed');

create policy special_goals_cancel_own
  on special_goals for update
  to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from challenge_participants cp
      where cp.id = special_goals.from_participant_id and cp.user_id = auth.uid()
    )
  )
  with check (status = 'cancelled');
