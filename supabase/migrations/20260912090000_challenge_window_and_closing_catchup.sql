-- Etapa 23 (Fase 1 da auditoria) — três correções na fronteira de datas do
-- desafio. Nenhuma altera regra de negócio: as três fazem o banco respeitar
-- regras que já estavam escritas em CLAUDE.md e que o código não aplicava.
--
--   1. check_in_daily_period() passa a recusar check-in fora da janela do
--      desafio (antes de start_date, depois de end_date).
--   2. close_daily_period() para de fechar dias ANTERIORES a start_date.
--   3. close_open_daily_periods() — recuperação para noites em que o cron
--      não rodou (antes, o dia perdido ficava aberto para sempre).
--
-- Nenhuma migration existente foi editada; nenhuma tabela foi alterada.

-- ---------------------------------------------------------------------
-- 1. Janela do desafio no check-in instantâneo
--
-- A duração é fixa (30/50/100/365 dias — CLAUDE.md seção 1) e um desafio
-- pode ser agendado para começar no futuro (CLAUDE.md seção 2). Nenhuma das
-- duas pontas era verificada aqui: enforce_daily_record_window só compara
-- record_date com "hoje", e esta função não olhava challenges de jeito
-- nenhum. Resultado: depois do end_date o participante continuava fechando
-- dias, creditando pontos e subindo streak — enquanto close_daily_period,
-- que já filtrava por `p_date <= c.end_date`, tinha parado de fechar os
-- dias de quem NÃO fazia check-in. As duas regras divergiam.
--
-- RecordsService.assertChallengeWindow (NestJS) faz a mesma checagem e é
-- quem devolve a mensagem amigável; esta aqui é a rede de segurança que
-- vale para qualquer caminho, inclusive a role postgres.
create or replace function check_in_daily_period(p_challenge_participant_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_already_closed boolean;
  v_completed_count integer;
  v_day_completed boolean;
  v_current_streak integer;
  v_longest_streak integer;
  v_total_days integer;
  v_new_streak integer;
  v_start_date date;
  v_end_date date;
begin
  select c.start_date, c.end_date
    into v_start_date, v_end_date
  from challenge_participants cp
  join challenges c on c.id = cp.challenge_id
  where cp.id = p_challenge_participant_id;

  if not found then
    raise exception 'challenge_participant_id inválido (%)', p_challenge_participant_id;
  end if;

  if v_today < v_start_date then
    raise exception 'este desafio ainda não começou (início em %)', v_start_date;
  end if;

  if v_today > v_end_date then
    raise exception 'este desafio já terminou (fim em %)', v_end_date;
  end if;

  select closed into v_already_closed
  from day_results
  where challenge_participant_id = p_challenge_participant_id and result_date = v_today;

  -- Trava contra chamada dupla (ex.: duas abas, ou uma corrida entre duas
  -- requisições) — sem isso, a segunda chamada somaria streak/pontos de
  -- novo para o mesmo dia.
  if v_already_closed then
    raise exception 'check-in de hoje já foi concluído para este participante (%)', p_challenge_participant_id;
  end if;

  select current_streak, longest_streak, total_days_completed
    into v_current_streak, v_longest_streak, v_total_days
  from challenge_participants
  where id = p_challenge_participant_id
  -- Bloqueia a linha até o fim da transação: duas chamadas simultâneas
  -- passam a serializar aqui em vez de lerem o mesmo current_streak.
  for update;

  select count(*) into v_completed_count
  from daily_records
  where challenge_participant_id = p_challenge_participant_id
    and record_date = v_today
    and completed = true;

  v_day_completed := v_completed_count >= 3;

  if v_day_completed then
    v_new_streak := v_current_streak + 1;
    update challenge_participants
      set current_streak = v_new_streak,
          longest_streak = greatest(v_longest_streak, v_new_streak),
          total_days_completed = v_total_days + 1
      where id = p_challenge_participant_id;
  else
    -- Cobre 2/3, 1/3 e 0/3 (nenhum registro preenchido no check-in) — nos
    -- três casos o streak quebra, mesma regra de close_daily_period().
    v_new_streak := 0;
    update challenge_participants
      set current_streak = 0
      where id = p_challenge_participant_id;
  end if;

  insert into day_results (challenge_participant_id, result_date, completed_goals_count, day_completed, streak_after, closed)
  values (p_challenge_participant_id, v_today, v_completed_count, v_day_completed, v_new_streak, true)
  on conflict (challenge_participant_id, result_date)
  do update set
    completed_goals_count = excluded.completed_goals_count,
    day_completed = excluded.day_completed,
    streak_after = excluded.streak_after,
    closed = true,
    updated_at = now();

  -- Mesma observação de idempotência de close_daily_period(): credita só
  -- os pontos das linhas retornadas por ESTE insert (recém-inseridas
  -- agora), nunca de uma releitura de points_ledger.
  with newly_inserted as (
    insert into points_ledger (challenge_participant_id, source_table, source_record_id, points, awarded_for_date)
    select dr.challenge_participant_id, 'daily_records', dr.id, dr.points_awarded, dr.record_date
    from daily_records dr
    where dr.challenge_participant_id = p_challenge_participant_id
      and dr.record_date = v_today
      and dr.completed = true
      and dr.points_awarded > 0
    on conflict (source_table, source_record_id) do nothing
    returning points
  )
  update challenge_participants
    set total_points = total_points + coalesce((select sum(points) from newly_inserted), 0)
  where id = p_challenge_participant_id;
end;
$$;

comment on function check_in_daily_period(uuid) is 'Fecha o dia de HOJE para um único participante, na hora: decide streak, credita pontos e marca day_results.closed = true. Recusa fora da janela do desafio (antes de start_date, depois de end_date) e se o dia já estiver fechado. Chamado por RecordsService.checkInDaily (NestJS).';

-- ---------------------------------------------------------------------
-- 2. close_daily_period não fecha dias antes do início do desafio
--
-- O loop filtrava `joined_at <= p_date` e `p_date <= c.end_date`, mas não
-- `p_date >= c.start_date`. Como dá para entrar num desafio agendado antes
-- de ele começar (CLAUDE.md seção 2), os dias entre a entrada e o início
-- eram fechados como 0/3 e apareciam como derrotas no histórico de dias em
-- que o desafio nem existia.
--
-- O resto da função é idêntico ao de 20260905090900_closing_jobs_and_cron.sql.
create or replace function close_daily_period(p_date date) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_new_streak integer;
begin
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
      and (cp.joined_at at time zone 'America/Sao_Paulo')::date <= p_date
      -- NOVO: nada antes do início do desafio.
      and p_date >= c.start_date
      and p_date <= c.end_date
    order by cp.id
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

-- ---------------------------------------------------------------------
-- 3. Recuperação de noites em que o cron não rodou
--
-- O agendamento sempre chamou close_daily_period(ontem). Se uma noite for
-- perdida — deploy, incidente, extensão desabilitada, projeto pausado — o
-- dia fica `closed = false` PARA SEMPRE: ninguém volta nele. O streak de
-- quem não fez check-in naquele dia nunca quebra e o histórico ganha um
-- buraco permanente.
--
-- POR QUE ISTO NÃO SIMPLESMENTE "FECHA TUDO QUE ESTÁ ABERTO":
-- close_daily_period aplica a decisão de streak sobre o current_streak
-- ATUAL do participante, não sobre o valor que ele tinha naquele dia. Se o
-- dia 5 ficou aberto mas os dias 6..10 já foram fechados, reprocessar o
-- dia 5 agora sobrescreveria o streak com uma decisão fora de ordem —
-- corromperia em vez de corrigir. Por isso:
--
--   - processa em ordem cronológica crescente;
--   - PULA qualquer participante que já tenha um dia fechado DEPOIS da
--     data em questão (esses ficam registrados como pulados, para
--     inspeção manual, em vez de serem adivinhados);
--   - tem janela máxima de retrocesso (p_lookback_days), para uma pausa
--     longa não disparar uma varredura de meses.
--
-- Ou seja: cobre com segurança o caso real (o cron perdeu as últimas N
-- noites) e se recusa a chutar no caso ambíguo.
create or replace function close_open_daily_periods(p_lookback_days integer default 14)
returns table (closed_date date, participants_closed integer, participants_skipped integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_from date := v_today - p_lookback_days;
  d date;
  v_skipped integer;
  v_before integer;
  v_after integer;
begin
  if p_lookback_days < 1 or p_lookback_days > 90 then
    raise exception 'p_lookback_days fora do intervalo aceito (1..90): %', p_lookback_days;
  end if;

  -- Da data mais antiga até ONTEM (o dia de hoje nunca é fechado em lote —
  -- quem fecha hoje é o check-in do próprio participante).
  d := v_from;
  while d <= v_today - 1 loop
    -- Participantes elegíveis neste dia que já têm um dia POSTERIOR
    -- fechado: reprocessar fora de ordem corromperia o streak deles.
    select count(*) into v_skipped
    from challenge_participants cp
    join challenges c on c.id = cp.challenge_id
    left join day_results dr
      on dr.challenge_participant_id = cp.id and dr.result_date = d
    where cp.status = 'active'
      and (cp.joined_at at time zone 'America/Sao_Paulo')::date <= d
      and d >= c.start_date
      and d <= c.end_date
      and coalesce(dr.closed, false) = false
      and exists (
        select 1 from day_results later
        where later.challenge_participant_id = cp.id
          and later.result_date > d
          and later.closed = true
      );

    select count(*) into v_before
    from day_results
    where result_date = d and closed = true;

    -- close_daily_period é idempotente por participante (pula quem já está
    -- fechado), então chamá-la aqui só toca em quem ficou para trás. Os
    -- participantes "fora de ordem" contados acima seriam tocados por ela
    -- também, então só chamamos quando não há nenhum nessa situação.
    if v_skipped = 0 then
      perform close_daily_period(d);
    end if;

    select count(*) into v_after
    from day_results
    where result_date = d and closed = true;

    closed_date := d;
    participants_closed := v_after - v_before;
    participants_skipped := v_skipped;

    -- Só reporta dias em que houve algo a fazer.
    if participants_closed > 0 or participants_skipped > 0 then
      return next;
    end if;

    d := d + 1;
  end loop;
end;
$$;

comment on function close_open_daily_periods(integer) is 'Recupera dias cujo fechamento noturno não rodou. Processa em ordem cronológica e pula (sem adivinhar) participantes que já tenham um dia posterior fechado, porque close_daily_period decide streak sobre o valor atual e reprocessar fora de ordem corromperia. Devolve um relatório por data.';

-- O job noturno passa a usar a versão com recuperação. Continua fechando
-- "ontem" no caso normal (nenhum dia pendente antes disso); a diferença é
-- que uma noite perdida deixa de ser permanente.
select cron.unschedule('close-daily-goals');

select cron.schedule(
  'close-daily-goals',
  '10 3 * * *',
  $$select close_open_daily_periods(14)$$
);
