-- Script de reset total dos DADOS de teste — NÃO é uma migration (não fica
-- em supabase/migrations/, não roda automaticamente em nenhum ambiente).
-- Rode manualmente no SQL Editor do Supabase só quando quiser voltar o
-- banco ao estado vazio para testar do zero.
--
-- IRREVERSÍVEL: apaga todas as contas (auth.users) e, em cascata, tudo que
-- depende delas — profiles, challenges, challenge_participants, goals,
-- goal_versions, daily/weekly/monthly/challenge_records, day_results,
-- points_ledger. O schema (tabelas, triggers, funções, RLS) não é tocado,
-- só os dados.
--
-- Ordem importa: challenges.created_by referencia auth.users SEM
-- "on delete cascade" (só challenge_participants.user_id tem cascade) —
-- por isso challenges precisa ser apagada antes de auth.users, senão o
-- delete de auth.users falha com violação de foreign key para qualquer
-- usuário que tenha criado um desafio.
--
-- TRUNCATE, não DELETE, na primeira linha: goal_versions tem um trigger
-- BEFORE DELETE FOR EACH ROW (trg_prevent_goal_version_delete,
-- 20260905090600_goals.sql) que bloqueia qualquer apagar nele, mesmo vindo
-- de cascade — de propósito, para o histórico nunca ser removido em uso
-- normal do app. TRUNCATE não dispara triggers de linha (só os raros
-- triggers de nível TRUNCATE, que não existem aqui), então passa por cima
-- dessa trava — mas só isso, nunca em uso normal do app.

truncate table challenges cascade;
delete from auth.users;
