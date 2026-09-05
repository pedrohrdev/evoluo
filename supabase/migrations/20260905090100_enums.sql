-- Enums do domínio. Nomes em inglês e minúsculo para casar com o que a
-- camada de aplicação (NestJS/Prisma) vai usar como valores de enum.

-- Tipo de meta: como o valor realizado é interpretado e comparado ao alvo.
create type goal_kind as enum ('hours', 'quantity', 'boolean');

-- Periodicidade da meta. "challenge" é a meta de longo prazo cujo período
-- é a duração inteira do desafio (30/50/100/365 dias) — ver docs/database-schema.md.
create type goal_period as enum ('daily', 'weekly', 'monthly', 'challenge');

-- Importância da meta, usada na tabela de configuração de pontos (points_config).
create type importance_level as enum ('low', 'medium', 'high');

-- Status do participante dentro de um desafio específico.
-- "inactive" é usado quando o participante sai do desafio: histórico, pontos
-- e streaks são preservados (decisão confirmada em docs/arquitetura-tecnica.md).
create type participant_status as enum ('active', 'inactive');
