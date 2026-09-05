-- Verificação da camada de banco de dados (docs/database-schema.md).
-- Rode isto inteiro de uma vez no SQL Editor do Supabase (ou via psql).
-- Cada linha do resultado é um item esperado: status OK, FALTANDO ou
-- DIVERGENTE (existe, mas com um número/valor diferente do esperado).
-- Se tudo estiver "OK", as 10 migrations rodaram certinho.

select 'extensão' as categoria, t.nome as item, '1' as esperado, count(e.extname)::text as encontrado,
       case when count(e.extname) = 1 then 'OK' else 'FALTANDO' end as status
from (values ('pgcrypto'), ('pg_cron')) as t(nome)
left join pg_extension e on e.extname = t.nome
group by t.nome

union all

select 'enum', t.nome, t.qtd_esperada::text, count(en.enumlabel)::text,
       case when count(en.enumlabel) = t.qtd_esperada then 'OK'
            when count(en.enumlabel) = 0 then 'FALTANDO'
            else 'DIVERGENTE' end
from (values ('goal_kind', 3), ('goal_period', 4), ('importance_level', 3), ('participant_status', 2)) as t(nome, qtd_esperada)
left join pg_type ty on ty.typname = t.nome
left join pg_enum en on en.enumtypid = ty.oid
group by t.nome, t.qtd_esperada

union all

select 'tabela', t.nome, '1', count(c.relname)::text,
       case when count(c.relname) = 1 then 'OK' else 'FALTANDO' end
from (values
  ('profiles'), ('challenges'), ('challenge_participants'), ('points_config'),
  ('goals'), ('goal_versions'), ('daily_records'), ('weekly_records'),
  ('monthly_records'), ('challenge_records'), ('day_results'), ('points_ledger')
) as t(nome)
left join pg_class c on c.relname = t.nome and c.relkind = 'r'
  and c.relnamespace = 'public'::regnamespace
group by t.nome

union all

select 'RLS habilitado', t.nome, 'true', coalesce(c.relrowsecurity::text, 'tabela não existe'),
       case when c.relrowsecurity then 'OK' else 'FALTANDO' end
from (values
  ('profiles'), ('challenges'), ('challenge_participants'), ('points_config'),
  ('goals'), ('goal_versions'), ('daily_records'), ('weekly_records'),
  ('monthly_records'), ('challenge_records'), ('day_results'), ('points_ledger')
) as t(nome)
left join pg_class c on c.relname = t.nome and c.relkind = 'r'
  and c.relnamespace = 'public'::regnamespace

union all

select 'nº de policies', t.nome, t.qtd_esperada::text, count(p.policyname)::text,
       case when count(p.policyname) = t.qtd_esperada then 'OK'
            when count(p.policyname) = 0 then 'FALTANDO'
            else 'DIVERGENTE (confira manualmente)' end
from (values
  ('profiles', 2), ('challenges', 3), ('challenge_participants', 3), ('points_config', 1),
  ('goals', 2), ('goal_versions', 1), ('daily_records', 3), ('weekly_records', 3),
  ('monthly_records', 3), ('challenge_records', 3), ('day_results', 1), ('points_ledger', 1)
) as t(nome, qtd_esperada)
left join pg_policies p on p.tablename = t.nome and p.schemaname = 'public'
group by t.nome, t.qtd_esperada

union all

select 'função', t.nome, '1', count(pr.proname)::text,
       case when count(pr.proname) >= 1 then 'OK' else 'FALTANDO' end
from (values
  ('handle_new_user'), ('generate_join_code'), ('set_left_at_on_deactivate'),
  ('enforce_daily_goal_limit'), ('prevent_goal_version_mutation'), ('prevent_goal_version_delete'),
  ('set_goal_version'), ('compute_daily_record_fields'), ('compute_period_record_fields'),
  ('enforce_daily_record_window'), ('enforce_period_record_window'), ('upsert_day_result'),
  ('close_daily_period'), ('close_period_records')
) as t(nome)
left join pg_proc pr on pr.proname = t.nome and pr.pronamespace = 'public'::regnamespace
group by t.nome

union all

select 'trigger', t.nome, '1', count(tg.tgname)::text,
       case when count(tg.tgname) >= 1 then 'OK' else 'FALTANDO' end
from (values
  ('trg_handle_new_user'), ('trg_set_left_at_on_deactivate'), ('trg_enforce_daily_goal_limit'),
  ('trg_prevent_goal_version_mutation'), ('trg_prevent_goal_version_delete'),
  ('trg_10_enforce_daily_record_window'), ('trg_20_compute_daily_record_fields'),
  ('trg_10_enforce_weekly_record_window'), ('trg_20_compute_weekly_record_fields'),
  ('trg_10_enforce_monthly_record_window'), ('trg_20_compute_monthly_record_fields'),
  ('trg_10_enforce_challenge_record_window'), ('trg_20_compute_challenge_record_fields'),
  ('trg_30_upsert_day_result')
) as t(nome)
left join pg_trigger tg on tg.tgname = t.nome and not tg.tgisinternal
group by t.nome

union all

select 'points_config: linhas', 'total', '12', count(*)::text,
       case when count(*) = 12 then 'OK' else 'DIVERGENTE' end
from points_config

union all

select 'points_config: valor', 'high/daily = 30', '30', coalesce(points::text, 'ausente'),
       case when points = 30 then 'OK' else 'DIVERGENTE' end
from points_config where importance = 'high' and period_type = 'daily'

union all

select 'points_config: valor', 'high/challenge = 150', '150', coalesce(points::text, 'ausente'),
       case when points = 150 then 'OK' else 'DIVERGENTE' end
from points_config where importance = 'high' and period_type = 'challenge'

union all

select 'cron job', t.nome, '1', count(j.jobname)::text,
       case when count(j.jobname) = 1 then 'OK' else 'FALTANDO (confira se pg_cron foi habilitado no dashboard)' end
from (values ('close-daily-goals'), ('close-weekly-goals'), ('close-monthly-goals'), ('close-challenge-goals')) as t(nome)
left join cron.job j on j.jobname = t.nome
group by t.nome

order by categoria, item;
