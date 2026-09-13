-- Correção pontual de DADO: conserta a data de início de um desafio criado
-- com o dia errado. NÃO é uma migration (não fica em supabase/migrations/,
-- não roda automaticamente em nenhum ambiente) — é script manual, para
-- rodar inteiro de uma vez no SQL Editor do Supabase.
--
-- Por que existe: o app não permite editar a data de início depois de criar
-- o desafio, e o seletor de data deixava escolher o dia vizinho sem dizer
-- que dia da semana era aquele. Foi o que aconteceu com o "Desafio da
-- PIAZADA": combinado para segunda, 2026-09-14, gravado como domingo,
-- 2026-09-13 — e o check-in liberou um dia antes do combinado, porque a
-- trava de início (RecordsService.assertChallengeWindow e
-- check_in_daily_period) compara com start_date, que estava errado. O
-- seletor de criação agora mostra o dia da semana junto da data, para o
-- erro ficar visível antes de enviar.
--
-- SÓ É SEGURO ENQUANTO NINGUÉM TIVER FEITO CHECK-IN. Mudar start_date não
-- recalcula nada retroativo: pontos (points_ledger), streaks
-- (challenge_participants.current_streak / longest_streak) e dias fechados
-- (day_results) já gravados continuam exatamente como estão. A checagem do
-- passo 1 existe para isso — se acusar registro, PARE e decida o que fazer
-- com esse histórico antes de mexer na data.
--
-- end_date não aparece em nenhum update aqui de propósito: é coluna gerada
-- (`start_date + (duration_days - 1)`, ver 20260905090300_challenges.sql) e
-- se recalcula sozinha.
--
-- Para usar em outro desafio, troque os três valores nas queries abaixo:
--   id do desafio  '909136f7-4493-4967-95aa-f47a34b3286c'
--   data errada    '2026-09-13'
--   data certa     '2026-09-14'

-- 1. ANTES: estado atual + checagem de segurança. As três contagens
--    precisam vir 0 — elas medem histórico de verdade (registro enviado,
--    dia fechado em 3/3, ponto creditado), que é o que mover a data
--    deixaria fora da janela do desafio.
--
--    day_results 0/3 e fechados NÃO entram na conta de propósito: o job
--    noturno antigo criava um por dia mesmo antes do início do desafio
--    (corrigido na migration 20260912090000), e o app não exibe nenhum
--    deles — histórico, heatmap e feed filtram por `result_date >=
--    start_date`. São linhas inertes; a query 1b abaixo mostra quais são.
select c.id,
       c.name,
       c.start_date,
       c.end_date,
       c.duration_days,
       (select count(*) from daily_records dr
         join challenge_participants cp on cp.id = dr.challenge_participant_id
        where cp.challenge_id = c.id) as registros,
       (select count(*) from day_results d
         join challenge_participants cp on cp.id = d.challenge_participant_id
        where cp.challenge_id = c.id and d.day_completed) as dias_concluidos,
       (select count(*) from points_ledger pl
         join challenge_participants cp on cp.id = pl.challenge_participant_id
        where cp.challenge_id = c.id) as pontos_creditados
  from challenges c
 where c.id = '909136f7-4493-4967-95aa-f47a34b3286c';

-- 1b. Os dias já fechados, para conferir a olho antes de mexer na data.
--     Tudo com data anterior à data certa e 0/3 é o lixo descrito acima.
select d.result_date, d.completed_goals_count, d.day_completed, d.closed
  from day_results d
  join challenge_participants cp on cp.id = d.challenge_participant_id
 where cp.challenge_id = '909136f7-4493-4967-95aa-f47a34b3286c'
 order by d.result_date;

-- 2. A correção. O `and start_date = <data errada>` deixa o script
--    idempotente: rodar de novo não mexe em nada na segunda vez.
update challenges
   set start_date = date '2026-09-14'
 where id = '909136f7-4493-4967-95aa-f47a34b3286c'
   and start_date = date '2026-09-13';

-- 3. DEPOIS: confirma a data nova e a end_date recalculada pelo banco.
--    Esperado para o Desafio da PIAZADA (100 dias):
--    start_date 2026-09-14, end_date 2026-12-22.
select id, name, start_date, end_date, duration_days
  from challenges
 where id = '909136f7-4493-4967-95aa-f47a34b3286c';
