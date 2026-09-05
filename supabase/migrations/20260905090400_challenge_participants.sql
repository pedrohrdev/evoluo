-- Vínculo usuário↔desafio. Guarda os campos agregados de leitura rápida
-- (streak, pontos, dias concluídos) que os módulos Streak/Scoring mantêm —
-- ver docs/arquitetura-tecnica.md, seção 5.
--
-- IMPORTANTE: current_streak, longest_streak, total_points e
-- total_days_completed NUNCA são graváveis pelo cliente (nem por INSERT nem
-- por UPDATE) — só pelas funções de fechamento (security definer). Isso é
-- reforçado tanto por RLS quanto por GRANT em nível de coluna (defesa em
-- profundidade: mesmo que uma policy tenha um erro de lógica, o privilégio
-- de coluna já bloqueia a escrita).

create table challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status participant_status not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  total_points integer not null default 0 check (total_points >= 0),
  total_days_completed integer not null default 0 check (total_days_completed >= 0),
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

comment on constraint challenge_participants_challenge_id_user_id_key on challenge_participants is 'Impede participação duplicada do mesmo usuário no mesmo desafio.';
comment on column challenge_participants.left_at is 'Marcado quando status vira inactive (saída do desafio). Histórico e ranking anteriores são preservados — decisão confirmada em docs/arquitetura-tecnica.md.';

create index challenge_participants_challenge_id_idx on challenge_participants (challenge_id) where status = 'active';
create index challenge_participants_user_id_idx on challenge_participants (user_id);
-- Suporta a ordenação do ranking (seção 2 do docs/arquitetura-tecnica.md):
-- streak atual desc, pontos desc, dias concluídos desc.
create index challenge_participants_ranking_idx
  on challenge_participants (challenge_id, current_streak desc, total_points desc, total_days_completed desc)
  where status = 'active';

alter table challenge_participants enable row level security;

create policy challenge_participants_select_authenticated
  on challenge_participants for select
  to authenticated
  using (true);

-- Entrar num desafio = inserir a própria linha. Nenhum campo agregado é
-- gravável (nem sequer aparece na lista de colunas liberadas para insert).
revoke insert on challenge_participants from authenticated;
grant insert (challenge_id, user_id) on challenge_participants to authenticated;

create policy challenge_participants_insert_own
  on challenge_participants for insert
  to authenticated
  with check (user_id = auth.uid());

-- Único campo que o próprio participante pode alterar depois de entrar é o
-- status (para sair do desafio). left_at é preenchido por trigger, não pelo
-- cliente.
revoke update on challenge_participants from authenticated;
grant update (status) on challenge_participants to authenticated;

create policy challenge_participants_update_own_status
  on challenge_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function set_left_at_on_deactivate() returns trigger as $$
begin
  if new.status = 'inactive' and old.status = 'active' then
    new.left_at := now();
  elsif new.status = 'active' and old.status = 'inactive' then
    new.left_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_left_at_on_deactivate
before update on challenge_participants
for each row execute function set_left_at_on_deactivate();
