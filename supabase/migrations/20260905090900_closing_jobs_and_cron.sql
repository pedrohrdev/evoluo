-- Fechamento de período: o único lugar onde streak, total_points e
-- total_days_completed de challenge_participants são escritos, e o único
-- lugar onde points_ledger recebe linhas. Roda uma única vez por período
-- fechado (idempotente via day_results.closed e via a unique constraint em
-- points_ledger(source_table, source_record_id) — rodar de novo não soma
-- em dobro).
--
-- Por que isso é um job agendado e não algo reativo a cada INSERT: um dia
-- só pode ser avaliado como "3/3 ou não" depois que ele efetivamente
-- termina — decidir isso no meio do dia, reativamente, faria o streak
-- oscilar visualmente conforme o participante fosse registrando as 3 metas
-- ao longo do dia. Ver docs/arquitetura-tecnica.md, seção 3 (módulo Day
-- Evaluation).

create or replace function close_daily_period(p_date date) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_new_streak integer;
begin
  -- Um participante por iteração: mais fácil de auditar do que várias
  -- instruções set-based tentando compartilhar CTEs (CTE só vale dentro da
  -- instrução a que está anexada — não dá pra reusar entre UPDATEs
  -- separados). Volume esperado (participantes ativos por dia) não
  -- justifica a complexidade de uma versão set-based.
  for r in
    select cp.id as challenge_participant_id,
           cp.current_streak,
           cp.longest_streak,
           cp.total_days_completed,
           dr.id as day_result_id,
           coalesce(dr.day_completed, false) as day_completed,
           coalesce(dr.closed, false) as already_closed
    from challenge_participants cp
    join challenges c on c.id = cp.challenge_id
    left join day_results dr
      on dr.challenge_participant_id = cp.id and dr.result_date = p_date
    where cp.status = 'active'
      -- joined_at é timestamptz: precisa converter para o mesmo fuso fixo
      -- usado em todo o resto (America/Sao_Paulo) antes de comparar com
      -- p_date — comparar direto com ::date usaria o fuso da sessão (ex.:
      -- UTC), o que perto da virada do dia classifica errado quem entrou
      -- "hoje" vs "ontem".
      and (cp.joined_at at time zone 'America/Sao_Paulo')::date <= p_date
      and p_date <= c.end_date
  loop
    if r.already_closed then
      continue; -- idempotência: já processado numa execução anterior
    end if;

    if r.day_completed then
      v_new_streak := r.current_streak + 1;
      update challenge_participants
        set current_streak = v_new_streak,
            longest_streak = greatest(r.longest_streak, v_new_streak),
            total_days_completed = r.total_days_completed + 1
        where id = r.challenge_participant_id;
    else
      -- cobre tanto "registrou algo mas não fechou 3/3" quanto "não
      -- registrou nada" (r.day_result_id is null) — nos dois casos o
      -- streak quebra, decisão confirmada em docs/arquitetura-tecnica.md.
      v_new_streak := 0;
      update challenge_participants
        set current_streak = 0
        where id = r.challenge_participant_id;
    end if;

    if r.day_result_id is null then
      insert into day_results (challenge_participant_id, result_date, completed_goals_count, day_completed, streak_after, closed)
      values (r.challenge_participant_id, p_date, 0, false, v_new_streak, true);
    else
      update day_results
        set closed = true, streak_after = v_new_streak, updated_at = now()
        where id = r.day_result_id;
    end if;
  end loop;

  -- Posta ao ledger os pontos de cada meta diária cumprida nesse dia
  -- (independente de o dia ter fechado 3/3 ou não — pontos de meta
  -- individual não dependem do streak).
  --
  -- IMPORTANTE para a idempotência: a soma que credita total_points usa
  -- apenas as linhas RETORNADAS por este INSERT (ou seja, só as que de
  -- fato acabaram de ser inseridas agora). Somar a partir de um SELECT
  -- separado em points_ledger filtrando por awarded_for_date, como uma
  -- primeira versão desta função fazia, soma de novo a cada execução
  -- (inclusive as linhas de execuções anteriores) e credita pontos em
  -- dobro/triplo a cada vez que o job roda de novo para a mesma data.
  with newly_inserted as (
    insert into points_ledger (challenge_participant_id, source_table, source_record_id, points, awarded_for_date)
    select dr.challenge_participant_id, 'daily_records', dr.id, dr.points_awarded, dr.record_date
    from daily_records dr
    where dr.record_date = p_date
      and dr.completed = true
      and dr.points_awarded > 0
    on conflict (source_table, source_record_id) do nothing
    returning challenge_participant_id, points
  )
  update challenge_participants cp
    set total_points = cp.total_points + sub.pts
  from (
    select challenge_participant_id, sum(points) as pts
    from newly_inserted
    group by challenge_participant_id
  ) sub
  where cp.id = sub.challenge_participant_id;
end;
$$;

comment on function close_daily_period(date) is 'Fecha o dia p_date: decide streak (3/3 vs quebra), grava day_results definitivo e posta pontos das metas diárias cumpridas no ledger. Idempotente. Chamado pelo cron job close-daily-goals para "ontem" (fuso America/Sao_Paulo).';

-- Fechamento de metas semanal/mensal/desafio: só posta pontos, nunca mexe
-- em streak (metas não-diárias não influenciam streak — decisão original
-- do produto). p_table indica qual das três tabelas fechar.
create or replace function close_period_records(p_table text, p_period_end date) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_table not in ('weekly_records', 'monthly_records', 'challenge_records') then
    raise exception 'p_table inválido: %', p_table;
  end if;

  -- Mesma observação de idempotência de close_daily_period(): a soma que
  -- credita total_points vem só das linhas retornadas por este INSERT
  -- (recém-inseridas agora), nunca de uma releitura de points_ledger.
  if p_table = 'weekly_records' then
    with newly_inserted as (
      insert into points_ledger (challenge_participant_id, source_table, source_record_id, points, awarded_for_date)
      select challenge_participant_id, 'weekly_records', id, points_awarded, period_end
      from weekly_records
      where period_end = p_period_end and completed = true and points_awarded > 0
      on conflict (source_table, source_record_id) do nothing
      returning challenge_participant_id, points
    )
    update challenge_participants cp
      set total_points = cp.total_points + sub.pts
    from (select challenge_participant_id, sum(points) as pts from newly_inserted group by challenge_participant_id) sub
    where cp.id = sub.challenge_participant_id;

  elsif p_table = 'monthly_records' then
    with newly_inserted as (
      insert into points_ledger (challenge_participant_id, source_table, source_record_id, points, awarded_for_date)
      select challenge_participant_id, 'monthly_records', id, points_awarded, period_end
      from monthly_records
      where period_end = p_period_end and completed = true and points_awarded > 0
      on conflict (source_table, source_record_id) do nothing
      returning challenge_participant_id, points
    )
    update challenge_participants cp
      set total_points = cp.total_points + sub.pts
    from (select challenge_participant_id, sum(points) as pts from newly_inserted group by challenge_participant_id) sub
    where cp.id = sub.challenge_participant_id;

  else
    with newly_inserted as (
      insert into points_ledger (challenge_participant_id, source_table, source_record_id, points, awarded_for_date)
      select challenge_participant_id, 'challenge_records', id, points_awarded, period_end
      from challenge_records
      where period_end = p_period_end and completed = true and points_awarded > 0
      on conflict (source_table, source_record_id) do nothing
      returning challenge_participant_id, points
    )
    update challenge_participants cp
      set total_points = cp.total_points + sub.pts
    from (select challenge_participant_id, sum(points) as pts from newly_inserted group by challenge_participant_id) sub
    where cp.id = sub.challenge_participant_id;
  end if;
end;
$$;

comment on function close_period_records(text, date) is 'Posta ao ledger os pontos de metas semanal/mensal/desafio cujo período terminou em p_period_end. Nunca toca em streak. Idempotente.';

-- ---------------------------------------------------------------------
-- Agendamento (pg_cron). Horários em UTC porque pg_cron roda no fuso do
-- servidor Postgres (UTC no Supabase); America/Sao_Paulo é UTC-3 o ano
-- todo (sem horário de verão desde 2019), então 00:10 local = 03:10 UTC.
--
-- Se `create extension pg_cron` (migration 20260905090000) ainda não foi
-- habilitada no dashboard do Supabase quando esta migration rodar, os
-- comandos abaixo falham — habilite a extensão e rode `select
-- cron.schedule(...)` manualmente uma vez, ou rode esta migration de novo.
-- ---------------------------------------------------------------------

select cron.schedule(
  'close-daily-goals',
  '10 3 * * *',
  $$select close_daily_period(((now() at time zone 'America/Sao_Paulo')::date) - 1)$$
);

select cron.schedule(
  'close-weekly-goals',
  '20 3 * * 1',
  $$select close_period_records('weekly_records', ((now() at time zone 'America/Sao_Paulo')::date) - 1)$$
);

select cron.schedule(
  'close-monthly-goals',
  '30 3 1 * *',
  $$select close_period_records('monthly_records', ((now() at time zone 'America/Sao_Paulo')::date) - 1)$$
);

select cron.schedule(
  'close-challenge-goals',
  '40 3 * * *',
  $$select close_period_records('challenge_records', ((now() at time zone 'America/Sao_Paulo')::date) - 1)$$
);
