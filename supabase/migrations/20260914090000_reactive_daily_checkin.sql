-- Reverte a regra de "check-in único por dia" (20260906090000): o
-- participante volta a poder registrar/corrigir as metas diárias de hoje
-- quantas vezes quiser ao longo do dia (uma agora, outra mais tarde),
-- exatamente como já funciona para metas semanais/mensais/de desafio.
--
-- Mudança de regra confirmada com o usuário. Trade-off aceito
-- explicitamente: streak e pontos voltam a ser decididos DE FORMA REATIVA
-- a cada registro (não só à noite) — inclusive podendo subir e descer no
-- mesmo dia se uma correção derrubar o dia de 3/3 para menos. Isso é
-- exatamente o comportamento que 20260906090000 e o desenho original
-- (upsert_day_result, ver 20260905090800) evitavam de propósito, pelo
-- risco de oscilação — o usuário optou conscientemente por reativo em vez
-- de esperar o fechamento noturno.
--
-- reconcile_daily_period() substitui tanto upsert_day_result() (que só
-- atualizava um contador tentativo, sem tocar em streak/pontos) quanto
-- check_in_daily_period() (que decidia streak/pontos uma única vez, na
-- hora do check-in em lote). Agora roda a cada INSERT/UPDATE em
-- daily_records, decide streak/pontos a partir do estado ATUAL do dia
-- (não de um delta), e por isso consegue tanto creditar quanto reverter.

drop trigger if exists trg_30_upsert_day_result on daily_records;
drop function if exists upsert_day_result();
drop function if exists check_in_daily_period(uuid);

create or replace function reconcile_daily_period() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_count integer;
  v_new_day_completed boolean;
  v_old_day_completed boolean;
  v_current_streak integer;
  v_longest_streak integer;
  v_total_days integer;
  v_new_streak integer;
begin
  -- Trava a linha do participante: duas metas diárias diferentes podem ser
  -- registradas quase ao mesmo tempo (duas abas, duas requisições) — sem
  -- isto, as duas leriam o mesmo current_streak "antigo" e uma delas
  -- perderia a atualização da outra (lost update).
  select current_streak, longest_streak, total_days_completed
    into v_current_streak, v_longest_streak, v_total_days
  from challenge_participants
  where id = new.challenge_participant_id
  for update;

  select day_completed into v_old_day_completed
  from day_results
  where challenge_participant_id = new.challenge_participant_id and result_date = new.record_date;

  v_old_day_completed := coalesce(v_old_day_completed, false);

  select count(*) into v_completed_count
  from daily_records
  where challenge_participant_id = new.challenge_participant_id
    and record_date = new.record_date
    and completed = true;

  v_new_day_completed := v_completed_count >= 3;
  v_new_streak := v_current_streak;

  if v_new_day_completed and not v_old_day_completed then
    -- Dia acabou de bater 3/3 (seja o primeiro registro do dia, seja uma
    -- correção que completou a 3ª meta que faltava).
    v_new_streak := v_current_streak + 1;
    update challenge_participants
      set current_streak = v_new_streak,
          longest_streak = greatest(v_longest_streak, v_new_streak),
          total_days_completed = v_total_days + 1
      where id = new.challenge_participant_id;
  elsif (not v_new_day_completed) and v_old_day_completed then
    -- Uma correção derrubou um dia que já estava 3/3 para menos — reverte
    -- exatamente o incremento acima. longest_streak NUNCA diminui (CLAUDE.md
    -- seção "Streak": é só informativo, não entra em nenhum critério de
    -- ranking) — o pico já alcançado continua valendo mesmo que o dia deixe
    -- de estar fechado agora.
    v_new_streak := greatest(v_current_streak - 1, 0);
    update challenge_participants
      set current_streak = v_new_streak,
          total_days_completed = greatest(v_total_days - 1, 0)
      where id = new.challenge_participant_id;
  end if;
  -- Nos outros dois casos (3/3 continua 3/3, ou continua abaixo de 3/3) o
  -- streak não muda — só completed_goals_count é atualizado abaixo.

  insert into day_results (challenge_participant_id, result_date, completed_goals_count, day_completed, streak_after, updated_at)
  values (new.challenge_participant_id, new.record_date, v_completed_count, v_new_day_completed, v_new_streak, now())
  on conflict (challenge_participant_id, result_date)
  do update set
    completed_goals_count = excluded.completed_goals_count,
    day_completed = excluded.day_completed,
    streak_after = excluded.streak_after,
    updated_at = now()
  -- Defesa em profundidade: mesmo que algo deixasse passar uma escrita fora
  -- do dia vigente, nunca reabre um dia que close_daily_period já trancou.
  where day_results.closed = false;

  -- Credita pontos das metas diárias que estão cumpridas hoje e ainda não
  -- tinham lançamento no ledger (idempotente via unique(source_table,
  -- source_record_id) — um dr.id específico só é creditado uma vez, mesmo
  -- que passe por completed=true mais de uma vez ao longo do dia depois de
  -- ter sido revogado abaixo).
  insert into points_ledger (challenge_participant_id, source_table, source_record_id, points, awarded_for_date)
  select dr.challenge_participant_id, 'daily_records', dr.id, dr.points_awarded, dr.record_date
  from daily_records dr
  where dr.challenge_participant_id = new.challenge_participant_id
    and dr.record_date = new.record_date
    and dr.completed = true
    and dr.points_awarded > 0
  on conflict (source_table, source_record_id) do nothing;

  -- Revoga pontos de metas que deixaram de estar cumpridas hoje (correção
  -- que baixou o valor registrado para abaixo do alvo) — consequência
  -- direta da regra "pontos são concedidos apenas pelo cumprimento"
  -- (CLAUDE.md seção "Pontos") agora que o mesmo registro pode deixar de
  -- estar cumprido no mesmo dia em que foi creditado.
  delete from points_ledger pl
  using daily_records dr
  where pl.source_table = 'daily_records'
    and pl.source_record_id = dr.id
    and dr.challenge_participant_id = new.challenge_participant_id
    and dr.record_date = new.record_date
    and dr.completed = false;

  -- total_points sempre igual à soma do ledger (todas as fontes, não só
  -- diária) — recomputar em vez de somar/subtrair deltas evita qualquer
  -- deriva quando uma meta oscila entre cumprida/não cumprida no mesmo dia.
  update challenge_participants
    set total_points = coalesce((select sum(points) from points_ledger where challenge_participant_id = new.challenge_participant_id), 0)
  where id = new.challenge_participant_id;

  return new;
end;
$$;

comment on function reconcile_daily_period() is 'Roda a cada INSERT/UPDATE em daily_records: recalcula completed_goals_count/day_completed de HOJE a partir do estado atual, e credita ou reverte streak/total_days_completed/pontos conforme o dia passa a bater 3/3 ou deixa de bater. Substitui upsert_day_result() e check_in_daily_period() (20260906090000, revertida por esta migration).';

create trigger trg_30_reconcile_daily_period
after insert or update on daily_records
for each row execute function reconcile_daily_period();

-- close_daily_period() continua rodando à noite via cron, mas agora só
-- precisa decidir por quem NÃO registrou nada no dia (0/3 automático,
-- regra original inalterada): quem registrou algo já teve seu dia decidido
-- reativamente por reconcile_daily_period(), então a existência de uma
-- linha em day_results para (participante, data) já significa "já
-- decidido" — o job só tranca (closed = true), nunca recalcula streak de
-- novo (evita dobrar o incremento/decremento já aplicado).
create or replace function close_daily_period(p_date date) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select cp.id as challenge_participant_id,
           dr.id as day_result_id,
           coalesce(dr.closed, false) as already_closed
    from challenge_participants cp
    join challenges c on c.id = cp.challenge_id
    left join day_results dr
      on dr.challenge_participant_id = cp.id and dr.result_date = p_date
    where cp.status = 'active'
      and (cp.joined_at at time zone 'America/Sao_Paulo')::date <= p_date
      -- Mesmos dois limites de 20260912090000 (preservados aqui: esta
      -- migration substitui a função inteira, então precisa repetir os
      -- dois, não só o de end_date que já existia antes dela).
      and p_date >= c.start_date
      and p_date <= c.end_date
    order by cp.id
  loop
    if r.day_result_id is not null then
      -- Já decidido reativamente durante o dia (reconcile_daily_period já
      -- aplicou o streak certo a challenge_participants) — só tranca.
      if not r.already_closed then
        update day_results set closed = true, updated_at = now() where id = r.day_result_id;
      end if;
      continue;
    end if;

    -- Ninguém registrou nenhuma meta diária nesse dia: 0/3 automático,
    -- streak quebra (mesma regra de sempre).
    update challenge_participants set current_streak = 0 where id = r.challenge_participant_id;

    insert into day_results (challenge_participant_id, result_date, completed_goals_count, day_completed, streak_after, closed)
    values (r.challenge_participant_id, p_date, 0, false, 0, true);
  end loop;

  -- Posta ao ledger os pontos de metas diárias cumpridas nesse dia que por
  -- algum motivo ainda não tinham lançamento — na prática, um no-op para
  -- quem já foi reconciliado durante o dia (a inserção reativa já fez
  -- isso), e a rede de segurança para qualquer linha que tenha escapado
  -- disso. Idempotente do mesmo jeito de sempre (on conflict do nothing +
  -- soma só das linhas recém-inseridas).
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

comment on function close_daily_period(date) is 'Fecha p_date à noite: para quem já registrou algo naquele dia, só tranca day_results.closed (reconcile_daily_period já decidiu streak/pontos em tempo real); para quem não registrou nada, aplica 0/3 automático. Idempotente.';
