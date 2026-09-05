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

- [ ] **20. Testes completos**
  Cobertura de testes automatizados (unitários/integração/e2e, conforme apropriado) das regras de negócio críticas: cumprimento de meta, streak, pontos, ranking, imutabilidade de histórico.

- [ ] **21. Polimento final**
  Ajustes finais de conteúdo, mensagens de erro, estados vazios, revisão geral antes do lançamento.
