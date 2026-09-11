-- Permite apagar um desafio inteiro (hard-delete) — decisão confirmada
-- com o usuário: só quem criou o desafio pode deletá-lo, e a exclusão é
-- total, cascateando para challenge_participants (on delete cascade,
-- 20260905090400) e daí para tudo que pendura em challenge_participant_id
-- (goals, records, day_results, points_ledger — todos já "on delete
-- cascade"), inclusive para os OUTROS participantes, não só o criador.
--
-- Isso conflita de propósito com a regra de "histórico imutável"
-- (CLAUDE.md seção 2 "Histórico"): goal_versions tem um trigger
-- (trg_prevent_goal_version_delete, 20260905090600_goals.sql) que barra
-- QUALQUER delete nela, inclusive vindo de cascade — sem mexer nisso, o
-- DELETE FROM challenges cascateado até goal_versions falharia e a
-- transação inteira desfaria.
--
-- A saída escolhida é um bypass estritamente local à transação (SET LOCAL
-- via set_config(..., is_local => true) — nunca persiste além do COMMIT/
-- ROLLBACK da própria transação, nunca afeta outra sessão): o trigger só
-- deixa passar o delete quando essa flag estiver ligada, e só
-- ChallengesService.remove() (apps/api/src/challenges/challenges.service.ts)
-- liga essa flag, depois de já ter verificado que quem está pedindo é
-- challenges.created_by. Não existe nenhum outro caminho no código que
-- ligue essa flag — a imutabilidade continua valendo para toda edição
-- pontual de meta; só cai para a exclusão explícita e completa do desafio
-- inteiro, que é uma operação diferente (destruição do dado, não edição
-- retroativa de um histórico que continuaria existindo).
create or replace function prevent_goal_version_delete() returns trigger as $$
begin
  if coalesce(current_setting('app.bypass_goal_version_immutability', true), 'off') <> 'on' then
    raise exception 'goal_versions nunca pode ser apagado (histórico imutável, goal_version_id=%)', old.id;
  end if;
  return old;
end;
$$ language plpgsql;

comment on function prevent_goal_version_delete() is 'Bloqueia delete em goal_versions, exceto durante a transação de um hard-delete de desafio inteiro (flag local app.bypass_goal_version_immutability, ligada só por ChallengesService.remove). Nunca permite editar/apagar uma versão isoladamente.';
