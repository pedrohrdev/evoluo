-- Fechamento instantâneo do dia de HOJE, para um único participante —
-- disparado pelo próprio participante ao concluir o "check-in" diário.
--
-- Mudança de regra confirmada com o usuário: o registro diário deixou de
-- ser "editável livremente até a virada do dia" e passou a ser um único
-- envio por dia ("check-in"). Isso remove o motivo original de esperar o
-- fechamento em lote só para streak/pontos diários: não existe mais o
-- risco de o streak subir de manhã e descer de tarde por causa de uma
-- edição posterior no mesmo dia (docs/arquitetura-tecnica.md seção 3 "Day
-- Evaluation" — motivo pelo qual close_daily_period() original é em lote),
-- porque não há mais edição posterior possível: RecordsService.checkInDaily
-- (NestJS) chama esta função na MESMA transação em que grava os
-- daily_records de hoje, e só permite chamar uma vez por dia (rejeita se
-- já fechado).
--
-- close_daily_period() (20260905090900) continua existindo, sem nenhuma
-- alteração, e continua rodando à noite via cron (close-daily-goals) — ela
-- é quem fecha o dia de quem NÃO fez check-in (fica 0/3 automático, regra
-- de negócio original, inalterada). A trava "already_closed" que já
-- existia em close_daily_period garante que ela nunca reprocessa (nem
-- soma streak/pontos em dobro para) quem já foi fechado aqui.
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
begin
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
  where id = p_challenge_participant_id;

  if not found then
    raise exception 'challenge_participant_id inválido (%)', p_challenge_participant_id;
  end if;

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

comment on function check_in_daily_period(uuid) is 'Fecha o dia de HOJE para um único participante, na hora: decide streak, credita pontos das metas diárias cumpridas e marca day_results.closed = true. Chamado por RecordsService.checkInDaily (NestJS) — só pode ser chamado uma vez por dia por participante (rejeita se já fechado). close_daily_period() continua cobrindo, à noite, quem não chamou esta função.';

-- Mesma superfície defensiva de quem já podia inserir em daily_records —
-- na prática o NestJS conecta como role postgres (ver docs/database-schema.md
-- "Sobre NestJS e RLS") e ignora este grant, mas ele documenta a intenção
-- e vale como defesa em profundidade caso algo chame via Supabase client
-- authenticated no futuro.
grant execute on function check_in_daily_period(uuid) to authenticated;
