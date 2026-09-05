-- Desafios. Duração fixa em dias (30/50/100/365); end_date é uma coluna
-- gerada (start_date + duração, inclusive) para nunca ficar fora de sincronia.
--
-- join_code: código não sequencial e difícil de adivinhar (decisão
-- confirmada em docs/arquitetura-tecnica.md, seção 2/6 — basta ter o código
-- para entrar, sem aprovação do criador, então o próprio código é o único
-- controle de acesso).

create or replace function generate_join_code() returns text
language plpgsql
as $$
declare
  -- sem caracteres ambíguos (0/O, 1/I)
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
  end loop;
  return result;
end;
$$;

create table challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_days integer not null check (duration_days in (30, 50, 100, 365)),
  start_date date not null,
  end_date date generated always as (start_date + (duration_days - 1)) stored,
  created_by uuid not null references auth.users (id),
  join_code text not null unique default generate_join_code(),
  created_at timestamptz not null default now()
);

comment on column challenges.end_date is 'Gerada: start_date + duration_days dias, inclusive. Nunca é gravada diretamente.';
comment on column challenges.join_code is 'Código não sequencial usado para entrar no desafio. Único caminho de controle de acesso — mantenha o comprimento/alfabeto atuais ou maiores ao alterar generate_join_code().';

create index challenges_join_code_idx on challenges (join_code);

alter table challenges enable row level security;

-- Leitura pública dentro do app. Assumido por extensão da decisão já
-- confirmada de que perfis são públicos para qualquer usuário autenticado
-- (docs/arquitetura-tecnica.md não decidiu isso explicitamente para
-- desafios — se quiser restringir a "só participantes", é só trocar esta
-- policy por uma que faça join com challenge_participants).
create policy challenges_select_authenticated
  on challenges for select
  to authenticated
  using (true);

-- Qualquer usuário autenticado pode criar um desafio, desde que
-- created_by seja o próprio usuário.
revoke insert on challenges from authenticated;
grant insert (name, description, duration_days, start_date, created_by) on challenges to authenticated;

create policy challenges_insert_own
  on challenges for insert
  to authenticated
  with check (created_by = auth.uid());

-- Só o criador edita nome/descrição. Duração e data de início nunca mudam
-- depois de criado (mudar isso quebraria a linha do tempo compartilhada e
-- as metas de duração já calculadas dos participantes).
revoke update on challenges from authenticated;
grant update (name, description) on challenges to authenticated;

create policy challenges_update_own
  on challenges for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Sem delete nesta fase (não especificado; apagar um desafio com
-- participantes ativos levanta questões — ex.: o que acontece com o
-- histórico deles — que ficam como DECISÃO PENDENTE se isso for pedido).
