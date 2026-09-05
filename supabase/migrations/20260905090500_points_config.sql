-- Tabela de configuração de pontos por importância × período.
-- Valores confirmados na conversa de arquitetura (docs/arquitetura-tecnica.md,
-- seção 2): diária = 30/20/10 (alta/média/baixa); semanal ×3, mensal ×4,
-- duração (challenge) ×5, porque essas metas são mais difíceis.
--
-- Trocar a escala no futuro é um UPDATE nesta tabela, nunca uma mudança de
-- código ou de schema.

create table points_config (
  importance importance_level not null,
  period_type goal_period not null,
  points integer not null check (points >= 0),
  primary key (importance, period_type)
);

comment on table points_config is 'Configuração de pontos por importância e período. Fonte da verdade para o cálculo feito nos triggers compute_daily_record_fields/compute_period_record_fields.';

insert into points_config (importance, period_type, points) values
  ('high',   'daily',     30),
  ('medium', 'daily',     20),
  ('low',    'daily',     10),
  ('high',   'weekly',    90),
  ('medium', 'weekly',    60),
  ('low',    'weekly',    30),
  ('high',   'monthly',   120),
  ('medium', 'monthly',   80),
  ('low',    'monthly',   40),
  ('high',   'challenge', 150),
  ('medium', 'challenge', 100),
  ('low',    'challenge', 50);

alter table points_config enable row level security;

-- Leitura liberada (não é dado sensível, e ajuda o frontend a mostrar
-- "essa meta vale X pontos"). Escrita não é exposta a nenhum papel de
-- cliente — só uma migration ou uma ferramenta administrativa futura altera
-- esta tabela.
create policy points_config_select_authenticated
  on points_config for select
  to authenticated
  using (true);
