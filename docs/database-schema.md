# Camada de Banco de Dados — Supabase/PostgreSQL

Implementação da camada de banco de dados descrita em `docs/arquitetura-tecnica.md`. Este documento cobre só o banco (schema, RLS, triggers, migrations) — nenhuma tela, dashboard ou fluxo de UI foi implementado neste passo.

Todas as migrations abaixo foram aplicadas e testadas de ponta a ponta num Postgres local simulando o ambiente Supabase (schema `auth`, roles `authenticated`/`anon`, `auth.uid()`) antes de entrarem no repositório: criação de conta, criação de desafio, entrada de dois participantes, configuração de metas, o exemplo exato do enunciado (3h contra meta de 5h → não cumpre; corrige para 7h → cumpre, sem pontos extras), fechamento do dia com um participante 3/3 e outro 1/3, nova execução do fechamento para confirmar idempotência, edição de meta confirmando que o histórico antigo não muda, e tentativas deliberadas de burlar RLS/imutabilidade (todas bloqueadas). A única peça não testável neste ambiente é o agendamento real do `pg_cron` (a extensão não está disponível aqui) — a sintaxe foi validada com uma função stub de `cron.schedule`.

## Migrations criadas

Em `supabase/migrations/`, na ordem em que devem rodar:

| Arquivo | Conteúdo |
|---|---|
| `20260905090000_extensions.sql` | `pgcrypto`, `pg_cron` |
| `20260905090050_base_grants.sql` | Privilégios de base em `authenticated`/`anon` (ver nota abaixo) |
| `20260905090100_enums.sql` | `goal_kind`, `goal_period`, `importance_level`, `participant_status` |
| `20260905090200_profiles.sql` | `profiles` + trigger de criação automática a partir de `auth.users` |
| `20260905090300_challenges.sql` | `challenges` + gerador de `join_code` |
| `20260905090400_challenge_participants.sql` | `challenge_participants` + trigger de `left_at` |
| `20260905090500_points_config.sql` | `points_config` (seed com os valores confirmados) |
| `20260905090600_goals.sql` | `goals`, `goal_versions`, triggers de limite e imutabilidade, função `set_goal_version` |
| `20260905090700_records.sql` | `daily_records`, `weekly_records`, `monthly_records`, `challenge_records` + triggers de cálculo e janela de edição |
| `20260905090800_day_results_and_ledger.sql` | `day_results`, `points_ledger` + trigger de atualização tentativa |
| `20260905090900_closing_jobs_and_cron.sql` | `close_daily_period`, `close_period_records` + agendamento `pg_cron` |

Rodam com `supabase db push` (ou `supabase migration up` num projeto linkado) ou, num Postgres qualquer, com `psql -f` em ordem. Nenhuma foi pensada para rodar fora de ordem — cada uma assume que as anteriores já existem.

**Nota sobre `20260905090050_base_grants.sql`**: um projeto Supabase já vem com `authenticated`/`anon` tendo privilégio amplo sobre o schema `public` (é assim que o PostgREST funciona — RLS é o que efetivamente filtra). Esta migration recria esse privilégio explicitamente para que o schema seja reproduzível também fora de um projeto Supabase (Postgres puro em CI, por exemplo), como pedido. Isso não abre a porta para escrita livre: RLS e os `REVOKE`/`GRANT` por coluna feitos tabela a tabela são o que realmente decide o que cada role lê ou grava.

**Nota sobre `pg_cron`**: no Supabase, a extensão normalmente precisa ser habilitada uma vez pelo dashboard (Database → Extensions) antes que `create extension pg_cron` e os `cron.schedule(...)` funcionem. Se a migration `20260905090900` falhar por isso, habilite a extensão e rode a migration de novo.

## Diagrama de relacionamentos

```
auth.users ─┬─< profiles (1:1)
            └─< challenge_participants >─┬─ challenges
                                          │
        goals >──┬── goal_versions ──┬──< daily_records
   (challenge_    │   (append-only,  ├──< weekly_records
   participant_id)│    imutável)     ├──< monthly_records
                  │                  └──< challenge_records
                  │
        challenge_participants ──< day_results
                                ──< points_ledger

points_config (tabela de referência, sem FK — lookup por importance+period_type)
```

`goals` guarda só a identidade (a quem pertence, qual periodicidade). `goal_versions` guarda o conteúdo (tipo, importância, valor-alvo) e é append-only: editar uma meta fecha a versão vigente e abre uma nova, nunca sobrescreve. Cada registro (`daily_records` etc.) referencia uma `goal_version_id` específica — a que estava vigente no momento — então editar a meta depois nunca altera um registro já gravado (confirmado no teste: mudar a meta de 5h para 3h não afetou o registro histórico que continua mostrando `target_value_snapshot = 5`).

## Enums

| Enum | Valores | Uso |
|---|---|---|
| `goal_kind` | `hours`, `quantity`, `boolean` | Tipo da meta |
| `goal_period` | `daily`, `weekly`, `monthly`, `challenge` | Periodicidade (`challenge` = meta de duração/longo prazo) |
| `importance_level` | `low`, `medium`, `high` | Importância da meta, chave de `points_config` |
| `participant_status` | `active`, `inactive` | Status do participante no desafio |

## Tabelas

| Tabela | Papel |
|---|---|
| `profiles` | Dados públicos de perfil, 1:1 com `auth.users`. Criada automaticamente no signup. |
| `challenges` | Desafio: nome, descrição, `duration_days` (30/50/100/365), `start_date`, `end_date` (gerada), `created_by`, `join_code`. |
| `challenge_participants` | Vínculo usuário↔desafio: `status`, `joined_at`/`left_at`, e os agregados `current_streak`, `longest_streak`, `total_points`, `total_days_completed`. |
| `goals` | Identidade da meta: a quem pertence, periodicidade. |
| `goal_versions` | Conteúdo da meta em cada momento (append-only). |
| `daily_records` | Registro real de uma meta diária numa data. |
| `weekly_records` / `monthly_records` / `challenge_records` | Mesma forma de `daily_records`, com `period_start`/`period_end` no lugar de uma data única. |
| `day_results` | Um por participante por dia: quantas das 3 diárias foram cumpridas, se o dia fechou, streak resultante. |
| `points_ledger` | Lançamento append-only de pontos — a trilha de auditoria de onde veio cada ponto. |
| `points_config` | Tabela de configuração: pontos por `importance` × `period_type`. |

## Constraints principais

Unicidade: `(challenge_id, user_id)` em `challenge_participants` impede participação duplicada; `(goal_id, record_date)` em `daily_records` e `(goal_id, period_start)` nas demais impedem registro duplicado no mesmo período; índices parciais únicos garantem no máximo 1 meta semanal/mensal/de desafio por participante (`goals_one_weekly_per_participant` e equivalentes) e no máximo 1 versão aberta por meta (`goal_versions_current_idx`, `where valid_until is null`).

Checks: `duration_days in (30,50,100,365)`; `current_streak/longest_streak/total_points/total_days_completed/points_awarded >= 0`; `chk_target_value_matches_kind` garante que `target_value` é nulo só para `boolean` e obrigatório/positivo para `hours`/`quantity`; `period_end > period_start` nas tabelas de período.

Foreign keys: `on delete cascade` de `challenge_participants` para `challenges`/`auth.users`, e das tabelas de meta/registro para `challenge_participants` e `goals`/`goal_versions` — apagar um desafio ou um usuário limpa o que depende dele; apagar um `goal` (não suportado nesta fase — sem policy de delete) levaria junto suas versões e registros.

Testado que a única coisa realmente impossível de expressar como constraint estática é "exatamente 3 metas diárias o tempo todo" — o banco garante o teto (nunca mais que 3, via trigger) e a aplicação garante o piso (bloquear o desafio como "não configurado" até as 3 existirem).

## Índices

Além dos índices únicos acima: `challenge_participants(challenge_id, current_streak desc, total_points desc, total_days_completed desc) where status='active'` suporta diretamente a consulta do ranking (streak → pontos → dias concluídos, na ordem confirmada em `arquitetura-tecnica.md`); `daily_records(challenge_participant_id, record_date)` e equivalentes suportam a consulta de histórico/analytics por participante e período; `day_results(result_date) where closed=false` suporta o job de fechamento encontrar rapidamente o que falta processar.

## RLS e policies

Todas as tabelas têm RLS habilitado. Padrão usado em todas: **leitura liberada para qualquer usuário autenticado** (perfis e desafios são públicos dentro do app — decisão confirmada em `arquitetura-tecnica.md`), **escrita restrita ao dono da linha**, e nas tabelas com campos sensíveis, **`REVOKE`/`GRANT` por coluna** além da policy — mesmo dentro de uma linha que a policy libera, `authenticated` não tem privilégio de gravar `current_streak`, `total_points`, `completed`, `points_awarded` etc. Isso foi testado diretamente: `INSERT INTO challenge_participants (..., current_streak) VALUES (..., 999)` falha com "permission denied for table", antes mesmo de qualquer policy ser avaliada.

`day_results` e `points_ledger` não têm nenhuma policy de insert/update/delete — por padrão do RLS, ausência de policy é negação total. A única forma de escrever nelas é através das funções `security definer` (`upsert_day_result`, `close_daily_period`, `close_period_records`), que rodam com o privilégio de quem criou a função, não do usuário chamador.

`goal_versions` não tem policy de insert nem de update para `authenticated` — toda escrita passa pela função `set_goal_version()`, que valida o dono e faz a transição fechar-versão-antiga/abrir-versão-nova numa transação só.

**Sobre `NestJS` e RLS**: a decisão em `arquitetura-tecnica.md` foi que o NestJS é a única porta de entrada dos dados (não expor a API automática do Supabase). Na prática, isso normalmente significa que o NestJS/Prisma conecta usando a connection string de acesso direto do Supabase (role `postgres`, que ignora RLS por ser superusuário) e implementa as mesmas checagens de posse em código. As policies aqui continuam valendo como **defesa em profundidade**: protegem qualquer acesso direto ao banco via chave `anon`/`authenticated` do Supabase, hoje ou no futuro (ex.: se o frontend um dia passar a ler dados públicos direto do Supabase para aliviar o NestJS, ou usar Realtime).

## Funções e triggers

| Nome | Tipo | O que garante |
|---|---|---|
| `handle_new_user` | trigger em `auth.users` | Cria o `profile` automaticamente no signup |
| `generate_join_code` | função | Código de 8 caracteres, alfabeto sem ambiguidade, usado como default de `challenges.join_code` |
| `set_left_at_on_deactivate` | trigger em `challenge_participants` | Preenche/limpa `left_at` ao mudar `status` |
| `enforce_daily_goal_limit` | trigger em `goals` | Nunca permite a 4ª meta diária |
| `prevent_goal_version_mutation` / `prevent_goal_version_delete` | triggers em `goal_versions` | Bloqueiam qualquer alteração de conteúdo ou apagamento de uma versão, mesmo fora do RLS — **testado**: tentativa como `postgres` (bypassa RLS) de mudar `target_value` de uma versão fechada, de reabri-la, e de apagá-la — as três falharam com o erro do trigger |
| `set_goal_version` | função `security definer` | Único caminho para editar uma meta: fecha a versão vigente e abre a nova, atomicamente, validando o dono |
| `compute_daily_record_fields` / `compute_period_record_fields` | triggers `before insert/update` nas 4 tabelas de registro | Calculam `kind`/`importance`/`target_value_snapshot` a partir do `goal_version`, decidem `completed` (`actual_value >= target`, sem proporcionalidade) e `points_awarded` (0 se não cumpriu; da tabela `points_config` se cumpriu) — sobrescrevem qualquer valor que o cliente tente enviar nesses campos |
| `enforce_daily_record_window` / `enforce_period_record_window` | triggers `before insert/update` | Só permitem gravar/editar o período ainda vigente (hoje, ou a semana/mês/desafio em curso), no fuso fixo `America/Sao_Paulo` — **testado**: pegou um caso real de borda de fuso (usar a data do servidor em vez da data em São Paulo levou à rejeição correta) |
| `upsert_day_result` | trigger `security definer` em `daily_records` | Mantém `day_results` atualizado "tentativamente" durante o dia (ex.: exibir "2/3 hoje"), sem nunca reabrir um dia já fechado |
| `close_daily_period(date)` | função `security definer`, chamada pelo cron | Decide streak (mantém/quebra), grava `day_results` definitivo, credita pontos das metas diárias cumpridas — idempotente (**testado**: rodar duas vezes para o mesmo dia não duplica pontos nem re-processa) |
| `close_period_records(text, date)` | função `security definer`, chamada pelo cron | Mesma lógica de fechamento para semanal/mensal/desafio, sem tocar em streak |

## Fechamento de período (por que é um job, não algo reativo)

Um dia só pode ser avaliado como "3/3 ou não" depois que ele termina — decidir isso reativamente a cada registro faria o streak oscilar durante o próprio dia (ex.: cair pra 0 assim que a 1ª meta for lançada de manhã, antes do usuário ter tido a chance de fazer as outras duas). Por isso: `upsert_day_result` mantém um contador tentativo em tempo real (bom para a UI mostrar progresso), e só `close_daily_period`, rodando uma vez por dia via `pg_cron` depois da meia-noite em `America/Sao_Paulo`, decide de fato o streak — nesse ponto o dia já não aceita mais edições (trigger de janela), então o cálculo é definitivo. O mesmo padrão vale para semanal/mensal/desafio via `close_period_records`.

Agendamento (horários em UTC, já que `pg_cron` roda no fuso do servidor e `America/Sao_Paulo` é UTC-3 o ano todo):

| Job | Cron (UTC) | Equivalente em São Paulo |
|---|---|---|
| `close-daily-goals` | `10 3 * * *` | 00:10, todo dia |
| `close-weekly-goals` | `20 3 * * 1` | 00:20, toda segunda |
| `close-monthly-goals` | `30 3 1 * *` | 00:30, dia 1 de cada mês |
| `close-challenge-goals` | `40 3 * * *` | 00:40, todo dia (fecha metas de desafio cujo período terminou ontem) |

## Bug real encontrado e corrigido durante os testes

Vale registrar porque não é óbvio: a primeira versão de `close_daily_period`/`close_period_records` creditava `total_points` somando **todas** as linhas de `points_ledger` daquela data a cada execução, em vez de somar só as linhas recém-inseridas nesta chamada. Isso é idempotente para o `INSERT` no ledger (a unique constraint com `ON CONFLICT DO NOTHING` cuida disso), mas **não** para o `UPDATE` de `total_points`, que duplicava o total a cada nova execução do job para a mesma data. A correção usa `INSERT ... RETURNING` dentro de um `WITH`, e soma só o que voltou do `RETURNING` (ou seja, só o que foi de fato inserido agora). Ficou confirmado no teste: rodar `close_daily_period` duas vezes seguidas para o mesmo dia agora mantém `total_points` estável.

Um segundo bug, também pego no teste: comparar `challenge_participants.joined_at` (timestamptz) contra a data de fechamento usando `joined_at::date` usa o fuso da sessão (UTC), não `America/Sao_Paulo` — perto da meia-noite isso classifica errado quem entrou "hoje" vs "ontem" no desafio, fazendo o job pular participantes elegíveis. Corrigido para `(joined_at at time zone 'America/Sao_Paulo')::date`.

## Decisões pendentes

Nenhuma decisão de negócio ficou pendente neste passo — todas já haviam sido fechadas em `docs/arquitetura-tecnica.md` (escala de pontos, desempate de ranking, fuso horário, visibilidade de perfil, entrada em desafio, saída de desafio, meta de duração para quem entra atrasado, dia sem registro, calendário semanal/mensal, edição do passado).

Duas coisas ficam registradas como **decisão de implementação em aberto** (não de negócio — não bloqueiam o restante do desenvolvimento, mas vale revisar antes de escalar para produção):

1. **Visibilidade de `challenges`**: a policy de leitura libera qualquer usuário autenticado ver qualquer desafio (nome, descrição, datas), por extensão da decisão já confirmada de que perfis são públicos. Isso não foi decidido explicitamente para desafios em nenhuma conversa anterior — se a intenção for restringir a "só quem já é participante, ou só quem tem o código", é uma troca pequena na policy `challenges_select_authenticated`.
2. **Orquestração do fechamento via `pg_cron` vs. via o backend**: implementei como jobs agendados dentro do próprio Postgres (`pg_cron`), que é o caminho mais direto no Supabase. Uma alternativa válida é o NestJS chamar `close_daily_period`/`close_period_records` via um scheduler próprio (ex.: `@nestjs/schedule`) — a vantagem seria logs/observabilidade centralizados na aplicação; a desvantagem é depender do backend estar de pé no horário certo. As funções já estão desenhadas para funcionar por qualquer um dos dois caminhos sem mudança.
