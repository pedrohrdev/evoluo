-- Regras da recusa, separadas da migration que cria o valor do enum:
-- Postgres não permite usar um valor de enum recém-adicionado na MESMA
-- transação em que ele foi criado (o `alter type ... add value` precisa ter
-- committed antes). Por isso duas migrations em vez de uma.

-- Transição: de `pending` agora também se pode ir para `declined`.
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

  if new.status = 'declined' and new.declined_at is null then
    raise exception 'declined_at é obrigatório ao recusar uma meta especial (special_goal_id=%)', old.id;
  end if;

  if new.status not in ('completed', 'cancelled', 'declined') then
    raise exception 'special_goals: transição de status inválida (de % para %, special_goal_id=%)', old.status, new.status, old.id;
  end if;

  return new;
end;
$$ language plpgsql;

-- RLS: o alvo pode concluir OU recusar. Quem criou continua só podendo
-- cancelar. As policies são a primeira linha; o trigger acima é quem
-- realmente barra, inclusive fora do RLS.
grant update (status, declined_at) on special_goals to authenticated;

drop policy if exists special_goals_complete_own on special_goals;

create policy special_goals_resolve_own
  on special_goals for update
  to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from challenge_participants cp
      where cp.id = special_goals.to_participant_id and cp.user_id = auth.uid()
    )
  )
  with check (status in ('completed', 'declined'));
