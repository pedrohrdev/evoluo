-- Etapa 26 (Fase 4 da auditoria) — metas especiais ganham recusa.
--
-- Decisão de negócio NOVA, dentro do plano aprovado pelo usuário: o alvo de
-- uma meta especial passa a poder RECUSAR, além de cumprir.
--
-- Por quê: a regra original (CLAUDE.md seção 2 "Metas especiais") era
-- "aplicada direto, sem aceite" e "sem limite de metas especiais
-- simultâneas", e o trigger prevent_special_goal_delete impede qualquer
-- apagamento. Somando as três, um participante podia encher a lista de
-- outro com tarefas-lixo que ficariam lá para sempre, sem nenhuma saída
-- para quem recebeu. A recusa é registrada publicamente como as demais
-- transições — a pressão social continua sendo o mecanismo, só deixa de ser
-- de mão única.
--
-- O que NÃO muda: continua sem aceite prévio (a meta nasce pendente e vale),
-- continua sim/não, continua sem prazo, e continua puramente social — nunca
-- gera pontos, nunca afeta streak nem ranking.

alter type special_goal_status add value if not exists 'declined';

-- `declined_at` segue o padrão de completed_at/cancelled_at.
alter table special_goals add column if not exists declined_at timestamptz;

comment on column special_goals.declined_at is 'Preenchido quando o alvo recusa a meta especial. Mesmo padrão de completed_at/cancelled_at: definitivo, sem reabertura.';
