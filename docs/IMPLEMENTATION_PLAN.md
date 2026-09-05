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

- [ ] **15. Dashboard**
  Tela(s) de visão geral do participante: progresso do dia, streak, pontos, ranking resumido, atalhos para registro.

- [ ] **16. UX/UI e simplificação**
  Revisão e refinamento da experiência de uso das telas já implementadas, simplificando fluxos e reduzindo fricção.

- [ ] **17. Responsividade/mobile**
  Ajustes de layout para uso confortável em telas pequenas/mobile.

- [ ] **18. Performance**
  Otimizações de consulta, cache (quando justificado por volume real) e revisão de índices, conforme apontado em `docs/arquitetura-tecnica.md` seção 7.

- [ ] **19. Segurança e regras anti-exploit**
  Revisão de autorização, rate limiting (especialmente no endpoint de entrada por código de desafio), validação de entrada, e confirmação de que a defesa em profundidade do banco (RLS + grants por coluna) continua íntegra.

- [ ] **20. Testes completos**
  Cobertura de testes automatizados (unitários/integração/e2e, conforme apropriado) das regras de negócio críticas: cumprimento de meta, streak, pontos, ranking, imutabilidade de histórico.

- [ ] **21. Polimento final**
  Ajustes finais de conteúdo, mensagens de erro, estados vazios, revisão geral antes do lançamento.
