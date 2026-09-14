# Plano de Implementação

Checklist de acompanhamento do projeto. Ver `CLAUDE.md` para as regras de execução (uma etapa por vez, fluxo de branch/commit/PR/merge, critérios para marcar uma etapa como concluída, proteção contra escopo).

Uma etapa só é marcada como `[x]` depois de implementada, testada, integrada ao restante do projeto e sem problemas conhecidos que a bloqueiem — nunca só por ter código escrito. Ver `CLAUDE.md` seção 8.

- [x] **1. Definição técnica + arquitetura do projeto**
  Escolha e justificativa da stack (TypeScript, NestJS, PostgreSQL, Prisma, Next.js, Supabase Auth), definição da arquitetura em monólito modular, separação de módulos de domínio, modelo de dados de alto nível e todas as decisões de negócio necessárias antes de codificar. Documentado em `docs/arquitetura-tecnica.md`.

- [x] **2. Banco de dados + Supabase**
  Implementação do schema completo no Supabase/PostgreSQL: tabelas, enums, constraints, índices, RLS e policies, funções e triggers (incluindo o versionamento imutável de metas e o cálculo de cumprimento/pontos), e os jobs agendados de fechamento de período (streak e pontuação). Testado de ponta a ponta contra um Postgres local simulando o ambiente Supabase. Documentado em `docs/database-schema.md`.

- [x] **3. Autenticação e usuários**
  Integração do backend (NestJS) com o Supabase Auth: cadastro, login, sessão/token, proteção de rotas autenticadas. Criação/uso do perfil (`profiles`) já modelado na etapa 2.

- [x] **4. Criação e entrada em desafios**
  Endpoints e lógica para criar um desafio (nome, descrição, duração de 30/50/100/365 dias, data de início) e para entrar em um desafio existente através do código/ID, usando as tabelas `challenges` e `challenge_participants` já existentes.

- [x] **5. Configuração das metas**
  Endpoints e lógica para o participante configurar suas metas: as 3 diárias obrigatórias, e as opcionais (semanal, mensal, duração). Validação dos tipos (horas/quantidade/sim-não), importância, e das regras de limite (máx. 3 diárias, máx. 1 de cada periodicidade opcional) já garantidas em parte pelo banco.

- [x] **6. Registro diário das metas**
  Endpoints e lógica para o participante lançar o valor realizado de cada meta diária no dia vigente, respeitando a janela de edição (só o dia de hoje) e sem permitir edição retroativa.

- [x] **7. Sistema de pontos**
  Exposição/consumo do cálculo de pontos já feito pelo banco (`points_config`, `points_awarded`, `points_ledger`): exibição de pontos por registro e pontos totais do participante, sem duplicar a lógica de cálculo no backend.

- [x] **8. Streak**
  Exposição do streak atual e maior streak do participante (já calculados e mantidos por `close_daily_period` no banco). Garantir que a UI/API reflitam corretamente o estado "tentativo" do dia em andamento (`day_results`) versus o streak definitivo já fechado.

- [x] **9. Ranking**
  Endpoint de ranking por desafio, ordenado por streak atual → pontos → total de dias concluídos → `participant_id`, usando os campos agregados já mantidos em `challenge_participants`.

- [x] **10. Perfis públicos**
  Endpoint(s) de perfil público de um participante, visível a qualquer usuário autenticado: metas, histórico, streak, pontos e estatísticas básicas.

- [x] **11. Histórico diário**
  Consulta do histórico dia a dia de um participante (registros diários passados), respeitando a imutabilidade já garantida no banco.

- [x] **12. Metas semanais/mensais**
  Registro e fechamento das metas semanais e mensais (calendário civil), reutilizando o padrão já criado para as diárias, sem afetar o streak.

- [x] **13. Metas de 30/50/100/365 dias**
  Registro e fechamento da meta de duração do desafio, incluindo o cálculo do valor-alvo ajustado para quem entra com o desafio já iniciado (dias restantes a partir da data de entrada).

- [x] **14. Sistema de análises**
  Endpoints de analytics que agregam os valores reais registrados (não apenas cumprido/não cumprido) por período, conforme `docs/arquitetura-tecnica.md` seção 3 (módulo Analytics).

- [x] **15. Dashboard + UX/UI e identidade visual**
  Como não havia nenhum frontend ainda, esta etapa passou a cobrir de uma vez o que as etapas 15 ("Dashboard") e 16 ("UX/UI e simplificação") do plano original descreviam separadamente: fundação do frontend (`apps/web`, Next.js App Router), design system próprio (cores, tipografia, componentes, sons), e o fluxo navegável completo — login/cadastro, criar/entrar em desafio, configurar as 3 metas diárias obrigatórias, dashboard, registro de metas, streak, ranking, histórico, análises e perfil público. Decisão registrada e confirmada com o usuário antes de codificar.

- [x] **16. UX/UI e simplificação (refinamento adicional)**
  Passada de consistência sobre as telas das etapas 15 e 17: rótulos de tipo/importância/periodicidade de meta centralizados em `lib/domain/labels.ts` (antes duplicados em 4 componentes), cabeçalho padrão (`PageHeader`) extraído para ranking/histórico/análises, e o estado "registrado abaixo do alvo hoje" deixou de usar vermelho (não é uma falha definitiva — o registro do dia ainda pode ser editado) e passou a usar o acento, reservando vermelho só para erro de verdade e para o "não concluído" definitivo do histórico.

- [x] **17. Responsividade/mobile**
  Ajustes de layout para uso confortável em telas pequenas/mobile: barra de navegação inferior fixa no lugar do menu de topo, cards de meta/ranking/histórico com empilhamento e truncamento seguros, modais com altura máxima e rolagem interna, filtros de análises roláveis horizontalmente em vez de quebrar o layout.

- [x] **18. Performance**
  Revisão de índices: todos os padrões de consulta usados pelas etapas 4-17 já estão cobertos pelos índices criados na etapa 2 (nenhum índice novo foi necessário). Otimizações de consulta aplicadas: `AnalyticsService` e `ProfilesService.getPublicProfile` faziam uma query por meta/participação (N+1); passaram a fazer no máximo uma query por tabela/lote. Frontend: chave de cache do React Query para `GET /profiles/:id` unificada (`profileQueryKey`), antes duplicada sob 3 nomes diferentes, o que fazia o mesmo perfil ser buscado mais de uma vez. Cache (Redis/view materializada) e pré-agregação de analytics permanecem deliberadamente fora de escopo — `docs/arquitetura-tecnica.md` seção 7 só recomenda isso quando o volume real justificar, o que ainda não é o caso.

- [x] **19. Segurança e regras anti-exploit**
  Rate limiting adicionado (`@nestjs/throttler`): limite global de 60 req/min por IP, com limites mais restritos (5/min) em `POST /auth/signup` e `POST /auth/login`, e 10/min em `POST /challenges/join` (o código já tem 32^8 combinações, mas ganhou uma camada extra contra tentativa automatizada). Revisão de autorização em todos os controllers: nenhuma brecha de IDOR encontrada — toda escrita resolve a posse pelo próprio recurso no servidor (ex.: `goalId` → `challengeParticipant.userId`), nunca por um `participantId` vindo do cliente. Validação de entrada: `ValidationPipe` global (`whitelist`/`forbidNonWhitelisted`/`transform`) e `ParseUUIDPipe` em todo `@Param`, já consistentes desde as etapas anteriores. Confirmado que nenhuma migration em `supabase/` foi tocada durante todo o desenvolvimento do backend (etapas 3-18) — RLS e grants por coluna da etapa 2 continuam íntegros.

- [x] **20. Testes completos (unitários — ver limitação de ambiente abaixo)**
  Backend com 121 testes (16 suítes), cobertura de branch 94%. Adicionados nesta etapa: testes diretos de validação de DTO (`class-validator`/`class-transformer`, antes nunca exercidos de verdade — todo teste anterior chamava o service direto, pulando a validação), cobrindo especificamente as regras que o DTO impõe (duração fixa do desafio, `targetValue` obrigatório para meta de horas/quantidade, tamanho do código de entrada); teste de `validateEnv` (nunca testado); e fechamento de branches não cobertos (propagação de erro não relacionado no `join`, agrupamento de múltiplos registros do mesmo dia no histórico, valor nulo defensivo em analytics).

  **Limitação de ambiente, documentada desde a etapa 3**: cumprimento de meta, streak, pontuação e a ordenação do ranking são computados por triggers/funções do Postgres (etapa 2), não pelo NestJS — os testes unitários (com `PrismaService` mockado) verificam que a camada de aplicação monta a consulta certa e repassa o resultado corretamente, mas não podem verificar a lógica SQL em si. Isso exigiria testes de integração contra um Postgres real rodando as migrations, que não é possível neste ambiente (sem Docker/Supabase CLI/credenciais).

- [x] **21. Polimento final**
  Ícone do app substituído pelo padrão do Next.js (gerado localmente via `app/icon.tsx`, sem asset externo, mesma marca do wordmark). Página 404 (`not-found.tsx`) personalizada com a identidade visual — antes caía na página genérica do Next.js. Revisão de conteúdo encontrou e corrigiu uma inconsistência real: o mesmo status ("participante saiu do desafio") tinha dois textos diferentes em duas telas (onboarding e perfil público); unificado em "Você saiu" — e corrigido para variar corretamente entre primeira e terceira pessoa no perfil público, que pode mostrar o desafio de qualquer usuário, não só o do próprio visitante. Revisão de mensagens de erro do backend (todas as ~35 mensagens de exceção): tom e clareza já consistentes, nenhuma mudança necessária.

- [x] **22. Metas especiais entre participantes**
  Nova decisão de negócio, confirmada com o usuário (ver CLAUDE.md seção 2 "Outras regras já confirmadas") e fora do modelo original de metas das etapas 1-21: um participante pode atribuir, a qualquer momento, uma meta avulsa (sempre sim/não, sem prazo fixo) a outro participante do mesmo desafio. Aplicada direto, sem aceite; puramente social — nunca gera pontos, nunca afeta streak/ranking; pública dentro do desafio, como as demais metas. Quem criou pode cancelar enquanto pendente; sem limite de metas especiais simultâneas.

  Backend: tabela `special_goals` nova (migration `20260911100000_special_goals.sql`, com trigger de mesmo-desafio e trigger de imutabilidade de transição de status, RLS com policies de select público/insert própria/complete pelo alvo/cancel por quem criou), módulo `SpecialGoalsModule` (create/list/complete/cancel), 10 testes unitários novos.

  Frontend: nova aba "Especiais" no desafio (`/c/[challengeId]/special-goals`) para criar, listar e concluir/cancelar; e, à parte (pedido separado do usuário na mesma etapa): card compacto de pódio (1º-3º) no painel do desafio, logo abaixo dos stats principais e acima de "Hoje" (foco em mobile).

- [x] **23. Correções críticas (Fase 1 da auditoria)**
  Primeira fase do plano de correções levantado na auditoria de produto e código. Nenhuma regra de negócio foi alterada — as mudanças fazem o código aplicar regras que já estavam em `CLAUDE.md` e que não eram cumpridas.

  **Fim do desafio (P0-1)**: `RecordsService` só validava `start_date`; `enforce_daily_record_window` e `check_in_daily_period()` não conheciam `challenges` de jeito nenhum. Depois do `end_date` o participante continuava fechando dias, creditando pontos e subindo streak — enquanto `close_daily_period`, que filtra por `p_date <= c.end_date`, já tinha parado de fechar os dias de quem não fazia check-in, deixando as duas regras divergindo. `assertChallengeStarted` virou `assertChallengeWindow` (as duas pontas) e a mesma checagem foi para o banco.

  **Rate limiting (P0-2)**: todo tráfego passa pelo rewrite `/api/*` do Next, então `req.ip` era sempre o do proxy e, sem `trust proxy`, `req.ips` ficava vazio — os limites de 60 req/min e 5 logins/min valiam para todos os usuários somados. Adicionados `trust proxy` e `UserThrottlerGuard`, que separa por usuário.

  **Código de convite (P0-3)**: `GET /challenges/:id` devolvia a linha inteira, `join_code` incluído, para qualquer autenticado — e o id do desafio é público (aparece no perfil de qualquer participante). Dava para ler os desafios de alguém pelo perfil e entrar em todos. O código passou para `GET /challenges/:id/join-code`, restrito a participantes.

  **Recuperação de senha (P0-4)**: não existia. `POST /auth/forgot-password` e `POST /auth/reset-password`, mais as telas `/forgot-password` e `/reset-password`.

  **Sair do desafio (P0-5)**: a regra estava documentada e o banco inteiro a suportava, mas não havia endpoint nem botão. `POST /challenges/:id/leave` + item no menu de configurações.

  **Perfil e avatares (P1-11, P1-4)**: um redirect tornava a página de perfil de outra pessoa inalcançável, e `<Avatar>` só era usado em 2 telas — ranking e pódio buscavam o perfil inteiro e desenhavam a inicial à mão. O ranking passou a devolver `displayName`/`avatarUrl` (o que também elimina o N+1), o redirect virou link, e a visão do desafio ganhou aba "Perfil".

  **Fechamento noturno (P1-5, P1-10)**: `close_daily_period` fechava dias anteriores a `start_date`; e o cron sempre chamou `close_daily_period(ontem)`, então uma noite perdida deixava o dia aberto para sempre. Nova `close_open_daily_periods()`, que recupera em ordem cronológica e pula participantes cujo streak seria corrompido por reprocessamento fora de ordem.

  Migration `20260912090000_challenge_window_and_closing_catchup.sql`. Testes: 171 passando (18 suítes), 26 novos.

  **Pendente de decisão do usuário antes do deploy**: aplicar a migration roda `close_open_daily_periods` na próxima noite. Se houver dias em aberto em produção hoje, eles serão fechados — o que pode quebrar streaks que estão intactos apenas porque o fechamento nunca rodou. Ver a seção correspondente na PR.

- [x] **24. Check-in seguro e histórico fiel (Fase 2 da auditoria)**
  `CheckInModal` tratava metas diárias E de período: registrar a meta semanal fechava o dia e zerava o streak de quem só queria lançar as horas da semana. Separado em `PeriodGoalModal`, com registro a partir da própria linha da meta. O check-in passou a prever o resultado no cliente (mesma regra do trigger), mostrar "N de 3 metas cumpridas" ao vivo e exigir uma segunda confirmação que nomeia a consequência ("isso zera seu streak de 12 dias e não tem como desfazer").

  `getHistory` passou a devolver o título da `goal_version` referenciada pelo registro — antes o frontend usava o título vigente, então renomear a meta reescrevia todo o histórico, violando a regra da seção "Histórico" do CLAUDE.md. O histórico também passou a mostrar o alvo da época.

  Contador de dia corrigido (era UTC do navegador, adiantava um dia entre 21h e a meia-noite); barra fixa de check-in na zona do polegar em mobile; passada de copy (plurais, jargão de cron, pontos por importância que nunca apareceram em tela).

- [x] **25. Ciclo do produto: convite, encerramento e lembrete (Fase 3 da auditoria)**
  **Convite**: `GET /challenges/preview/:joinCode` (única rota sem autenticação do app, com limite próprio) e página pública `/join/[code]`, para o link abrir para quem ainda não tem conta. Login/cadastro honram `?next=` (só caminhos internos). `JoinCodeBadge` passou a compartilhar o link, com Web Share API no celular.

  **Encerramento**: passado o `end_date`, o painel vira `ChallengeResult` — pódio final, maior streak, dias completos, totais reais acumulados (do analytics) e "criar a revanche". Antes o produto não tinha fim: o contador travava em "30/30" e o botão de check-in continuava lá.

  **Landing** em `/`, que antes redirecionava direto para o login sem uma linha sobre o que é o produto.

  **Transparência de metas**: `GET /goals/:goalId/versions` e o marcador "editada há N dias". Decisão de negócio confirmada com o usuário: a edição continua valendo **imediatamente**, inclusive para o dia em curso (ver CLAUDE.md seção 2) — a proposta de adiar o efeito para o dia seguinte foi descartada porque puniria quem troca de meta de manhã querendo cumpri-la no mesmo dia.

  **Lembrete diário**: `RemindersService` + `POST /reminders/daily`, protegida por segredo compartilhado (fechada por padrão). Envio plugável: sem `RESEND_API_KEY`/`REMINDER_FROM_EMAIL` o disparo vira no-op com log, para a rota poder ir a produção antes da credencial existir.

  187 testes passando (19 suítes).

- [x] **27. Testes de integração contra Postgres real (Fase 5 da auditoria)**
  Fecha a maior lacuna de qualidade apontada na auditoria: cumprimento de meta, pontuação, streak, janela de edição, imutabilidade do histórico e idempotência do fechamento são decididos por **triggers e funções do PostgreSQL**, não pelo NestJS — e os 200 testes unitários mockam o `PrismaService`, então nenhum deles tocava numa linha dessa lógica. A cobertura de 94% media a casca.

  Harness em `apps/api/test/integration/`: `supabase-shim.sql` reproduz num Postgres puro o mínimo do ambiente Supabase de que as migrations dependem (roles `anon`/`authenticated`, schema `auth` com `users` e `auth.uid()`, schema `storage`, stub de `pg_cron`); `db.ts` aplica shim + todas as migrations de `supabase/migrations` em ordem numa base descartável e oferece helpers de seed; `global-setup.ts` sobe um **Postgres 18 embarcado** (`embedded-postgres`) quando `DATABASE_URL_TEST` não está definida.

  Essa última decisão é o que torna a suíte utilizável: a limitação registrada desde a etapa 3 era "não é possível testar contra um Postgres real neste ambiente (sem Docker/Supabase CLI)". O `embedded-postgres` distribui o binário via npm, então o mesmo caminho roda na máquina de quem desenvolve e no CI, sem Docker. **A limitação de ambiente da etapa 20 deixa de valer.**

  22 testes em 2 suítes, cobrindo: cumprimento a partir do alvo sem proporcionalidade, ausência de bônus por exceder (o exemplo literal do enunciado), escala de `points_config` por importância, impossibilidade de o cliente forjar `completed`/`points_awarded`, janela de edição, check-in 3/3 e 2/3, dupla chamada barrada, recusa antes do início e depois do fim do desafio, idempotência do fechamento noturno, o bug do fechamento antes de `start_date` (P1-5), recuperação de noites perdidas, imutabilidade de `goal_versions` mesmo como superusuário, snapshot preservado após edição da meta, teto de 3 metas diárias e a ordenação do ranking.

  CI em `.github/workflows/ci.yml`: um job de build/lint/testes unitários e outro que roda as migrations reais e exercita o SQL.

  Comando: `npm run api:test:int`.

  **Itens da Fase 5 deliberadamente não feitos** (ver relatório final): verificação local do JWT no guard (P1-7) — mexe em autenticação de um app com usuários reais e não deve ser feita às pressas; paginação de histórico/ranking; recorte temporal em analytics.

- [x] **28. Check-in único revertido para registro reativo**
  Mudança de regra confirmada com o usuário: o check-in único por dia (etapa 24) foi revertido. Cada meta diária volta a ser um registro avulso por `goalId` — mesmo padrão de semanal/mensal/duração —, podendo ser feito e corrigido quantas vezes quiser ao longo do dia ("marcar algo agora, outra coisa depois").

  Trade-off aceito explicitamente pelo usuário: como não existe mais "check-in que fecha o dia", streak e pontos passaram a ser decididos **de forma reativa, a cada registro** (trigger `reconcile_daily_period`, migration `20260914090000`, substituindo `upsert_day_result` e `check_in_daily_period`), podendo subir e descer no mesmo dia se uma correção derrubar o dia de 3/3 para menos — o mesmo risco de oscilação que a etapa 24 tinha eliminado de propósito. `close_daily_period` (job noturno) passou a só trancar quem já foi decidido reativamente durante o dia, sem recalcular streak de novo.

  Backend: `RecordsController`/`RecordsService.recordCurrentDaily` substitui `checkInDaily` — `PUT /goals/:goalId/daily-record`, no lugar de `PUT /challenge-participants/:id/daily-check-in`. Frontend: `CheckInModal` removido; `PeriodGoalModal` (antes só semanal/mensal/duração) passou a atender também metas diárias, cada uma registrada a partir da própria linha em `GoalSummaryRow`. Removida a lógica de "esconder tudo depois do check-in" no dashboard (badge "check-in concluído", barra fixa mobile, segunda confirmação de perda de streak) — não existe mais um estado de "dia fechado" enquanto ainda é hoje.

  Testes: 215 testes unitários (API) + 25 testes de integração contra Postgres real, incluindo os novos cenários de streak/pontos subindo, revertendo e re-creditando no mesmo dia, e o job noturno não duplicar o que já foi decidido reativamente. `npm run api:test` e `npm run api:test:int`.
