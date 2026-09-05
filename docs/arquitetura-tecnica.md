# Análise Técnica e Arquitetura — App de Desafios entre Amigos

Documento de referência para as próximas etapas de desenvolvimento. Nenhum código foi escrito a partir dele; o objetivo aqui é fechar o entendimento do domínio, a arquitetura e o modelo de dados antes de começar a implementação. Todas as decisões de negócio que dependiam de você já foram esclarecidas em duas rodadas e aparecem incorporadas no texto como regra definitiva (seção 2, e a escala de pontos/desempate do ranking também na seção 2) — a seção 9 confirma que não há mais nenhuma pendência de negócio antes do schema.

## 1. Stack confirmada

Stack confirmada como proposta originalmente: TypeScript de ponta a ponta, NestJS no backend, PostgreSQL com Prisma, Next.js no frontend. Nada muda na arquitetura das seções seguintes por causa disso — é a base que o restante do documento já assumia.

A natureza do produto pesa fortemente para um banco relacional e uma linguagem única de ponta a ponta. As regras descritas (streak que depende de contar 3 metas do mesmo dia, snapshots imutáveis de metas, ranking com desempate em duas colunas, agregações de analytics sobre séries temporais) são essencialmente problemas de integridade transacional e de consulta relacional — exatamente o ponto forte de um banco SQL com um ORM tipado, e um ponto fraco de bancos de documentos, onde manter consistência entre desafio, participante, meta e registro diário exigiria lógica de aplicação extra para compensar a ausência de transações e joins nativos.

Composição confirmada:

- **Linguagem**: TypeScript de ponta a ponta (frontend e backend), para compartilhar tipos de domínio (por exemplo, os três tipos de meta e os enums de duração) entre as camadas e reduzir divergência entre o que o backend calcula e o que o frontend exibe.
- **Backend**: Node.js com NestJS. NestJS impõe uma estrutura modular (módulos, providers, injeção de dependência) que mapeia bem para a separação que você pediu entre desafio, participante, metas, registros, pontuação, streak, ranking e analytics — cada um vira um módulo com fronteira explícita, o que facilita tanto testar isoladamente quanto, no futuro, extrair um módulo para um serviço separado se a escala exigir.
- **Banco de dados**: PostgreSQL. Suporta bem o modelo de snapshots imutáveis (chaves estrangeiras para uma versão específica de meta), constraints e transações para a cadeia registro → conclusão do dia → pontuação → streak, e janelas/funções de agregação que a análise de hábitos vai precisar.
- **ORM**: Prisma. Migrations versionadas e tipagem gerada automaticamente a partir do schema, o que ajuda a manter o TypeScript do backend sincronizado com o banco.
- **Frontend web**: React com Next.js (App Router). Cobre tanto páginas públicas (perfil de participante, entrada em desafio por ID) quanto área autenticada, com a opção de renderizar no servidor quando fizer sentido para SEO/performance dos perfis públicos.
- **Autenticação**: Supabase Auth (ver decisão sobre Supabase logo abaixo) — consolida em um único provedor gerenciado em vez de somar mais um serviço externo só para login/senha/OAuth.
- **Infraestrutura inicial**: Supabase para o Postgres gerenciado; Vercel para o frontend Next.js; Railway/Render/Fly.io (ou similar) para hospedar a API NestJS. Migrar para infraestrutura própria é um passo natural mais adiante, não uma decisão a tomar agora.

Duas decisões que estavam em aberto foram resolvidas juntas, porque uma condiciona a outra:

**REST ou GraphQL** — fica **REST**. A razão é a escala que você descreveu: com muitos usuários registrando todo dia e consultando gráficos, dá para cachear e limitar taxa de requisição por rota de forma trivial com REST (cada endpoint é uma URL própria; um proxy/CDN na frente resolve isso sem configuração especial), enquanto GraphQL concentra tudo em um único endpoint POST e exigiria camadas extras (limite de profundidade/complexidade de query, cache por assinatura de query) só para chegar no mesmo nível de proteção contra abuso — trabalho que não compensa nesta fase. A necessidade de consultas flexíveis para analytics é real, mas isso é resolvido com endpoints REST de agregação parametrizados (ex.: `GET /analytics/:participantId/hours?period=week&from=...`) em vez de abrir um esquema GraphQL inteiro só para essa área.

**Continua sendo Supabase?** — sim, com um recorte específico: Supabase entra apenas como Postgres gerenciado e como provedor de autenticação. O que não muda é a API — a lógica de negócio deste produto (versionamento de metas, avaliação do dia, cadeia de pontuação, streak) é complexa e transacional demais para deixar na API automática do Supabase (PostgREST ou o `pg_graphql` dele), que dependeria de regras em triggers/RLS dentro do banco, muito mais difícil de testar e evoluir do que código no NestJS. Ou seja, a condição que você colocou — "se continuar Supabase, vai de GraphQL" — não se aplica aqui: não vamos usar a API que o Supabase gera sozinho, só o banco e o auth dele, por baixo de uma API REST própria.

## 2. Decisões de negócio confirmadas

As ambiguidades levantadas na primeira versão deste documento foram esclarecidas. Ficam registradas aqui como regras de negócio definitivas, para não dependerem só da conversa:

A meta de duração pode ser de qualquer um dos três tipos (horas, quantidade, sim/não), igual às metas diária/semanal/mensal — não é obrigatoriamente um total acumulado de um tipo fixo.

Quem entra em um desafio já iniciado tem a meta de duração recalculada para os dias restantes a partir da data de entrada, não para a duração cheia do desafio: alguém que entra no dia 10 de um desafio de 30 dias tem uma meta de duração de 20 dias, não de 30.

Um dia sem nenhum registro lançado é 0/3 automaticamente — o streak quebra sem exigir nenhuma ação explícita do participante, e sem prazo de tolerância.

Semana e mês, para as metas semanal e mensal, seguem o calendário civil: semana de segunda a domingo, mês do dia 1 ao último dia do mês (não são períodos relativos ao início do desafio).

O participante não pode editar nenhum registro (diário, semanal, mensal, de duração) depois que a data à qual ele pertence já passou. Isso vale tanto para corrigir um valor lançado errado quanto para lançar um registro atrasado de um dia que ficou em branco — não existe atualização retroativa nem preenchimento tardio. Na prática isso simplifica a arquitetura: o Day Evaluation (seção 3) nunca precisa de um caminho de recálculo, porque o resultado de um dia, uma vez fechado, não muda mais.

O fechamento do dia (para streak e para o corte de edição) usa um fuso horário fixo do servidor — `America/Sao_Paulo` — em vez do fuso de cada participante, o que simplifica o job de fechamento e a regra de corte de edição, à custa de um participante em fuso muito diferente sentir o dia "virar" num horário local incomum para ele.

O perfil é público para qualquer usuário logado no aplicativo, mesmo que ele não participe de nenhum desafio em comum com o dono do perfil — não é preciso checar participação em desafio comum para autorizar a leitura.

Basta ter o código do desafio para entrar; não há aprovação do criador. Isso reforça a recomendação da seção 6 de que o código seja não sequencial e longo o suficiente para não ser adivinhável, já que ele sozinho garante a entrada.

Sair de um desafio não apaga nada: o vínculo (`ChallengeParticipant`) fica marcado como inativo, some do ranking ativo e não pode mais registrar, mas todo o histórico, pontos e streaks permanecem intactos e consultáveis no perfil.

As duas últimas decisões de negócio também foram fechadas:

A escala de pontos por importância é **alta = 30, média = 20, baixa = 10**, para metas diárias. Para refletir que metas semanal, mensal e de duração são mais difíceis (como o texto original pede — "geram pontos adicionais porque são metas mais difíceis"), cada período aplica um multiplicador sobre esse valor-base: semanal ×3, mensal ×4, duração ×5. Isso dá a tabela completa:

| Importância | Diária | Semanal (×3) | Mensal (×4) | Duração (×5) |
|---|---|---|---|---|
| Alta | 30 | 90 | 120 | 150 |
| Média | 20 | 60 | 80 | 100 |
| Baixa | 10 | 30 | 40 | 50 |

Essa tabela vive inteira como configuração do módulo Scoring (seção 3) — trocar qualquer um desses seis números (3 importâncias × valor-base, ou os 3 multiplicadores de período) é editar uma constante, não mexer em regra de código.

O desempate do ranking, para quando streak atual e pontos totais são idênticos entre dois participantes, usa o **total de dias concluídos no desafio inteiro** (soma de todos os dias em que o participante bateu 3/3, não só o streak atual). Esse critério prioriza consistência ao longo de todo o desafio sem usar o maior streak histórico, que a especificação já definia que não deve influenciar o ranking. Se ainda assim dois participantes empatarem nos três critérios (streak, pontos e dias concluídos — matematicamente raro, mas possível), o desempate final é técnico, não de negócio: ordena por `participant_id` só para a lista ficar estável entre uma consulta e outra.

## 3. Arquitetura geral

A recomendação é um **monólito modular** (não microsserviços) para esta fase. Microsserviços resolveriam um problema de escala de equipe e de deploy independente que este produto ainda não tem, e adicionariam custo de infraestrutura (rede entre serviços, consistência distribuída) exatamente nas partes mais sensíveis a erro: a cadeia registro → conclusão do dia → pontos → streak precisa de consistência transacional, que é trivial dentro de um único banco e um único processo, e dolorosa entre serviços separados.

Modular, porém, quer dizer que dentro desse único backend as fronteiras de domínio pedidas na sua lista são respeitadas como módulos com interface própria, comunicação interna, e nenhum acesso direto ao dado de outro módulo por fora dessa interface. Isso é o que permite, se um dia o produto crescer muito, extrair por exemplo o módulo de Analytics para um serviço à parte sem reescrever o resto — a fronteira já existe, só muda de estar dentro do processo para estar atrás de uma chamada de rede.

Os módulos propostos, e a razão de cada corte:

**Challenges** — criação de desafio, geração/validação do ID de entrada, duração fixa (30/50/100/365). Não conhece metas nem pontuação; só sabe "existe um desafio com essa duração, começando nessa data, com esses participantes".

**Participants** — vínculo entre um usuário e um desafio (um usuário pode participar de vários desafios, cada vínculo é independente). É o dono dos campos agregados de leitura rápida: streak atual, maior streak, pontos totais — mas não é quem *calcula* esses valores, apenas os armazena como resultado do que os módulos de Streak e Scoring publicam.

**Goals** — cadastro das metas de cada participante (3 diárias obrigatórias, 1 semanal opcional, 1 mensal opcional, 1 de duração) e, crucialmente, o versionamento delas (seção 4). É o único módulo que pode criar uma nova versão de meta; nenhum outro módulo edita uma meta diretamente.

**Daily Records** (e os equivalentes semanal/mensal/duração) — recebe o valor real lançado pelo participante para uma meta em uma data, resolve contra o snapshot da versão vigente da meta naquele momento, e decide se aquele registro individual foi cumprido. Não decide se o *dia* foi concluído (isso depende dos outros registros do mesmo dia) nem calcula pontos — só registra fato e resultado por meta.

**Day Evaluation** — depois que os registros de um dia existem (ou o dia se encerra sem todos os registros), este módulo aplica a regra "3/3 cumpridas = dia concluído" e publica esse resultado. É a fronteira exata onde a regra do streak vive, isolada de como os pontos são calculados. Como não existe edição retroativa nem preenchimento tardio (seção 2), essa avaliação roda uma única vez por dia, disparada por um job agendado no fuso fixo do servidor, e nunca precisa reabrir um dia já fechado.

**Scoring** — consome o resultado de cada meta cumprida (diária, semanal, mensal ou de duração) e converte em pontos, usando a tabela de importância × período da seção 2 (30/20/10 na diária, com multiplicador ×3/×4/×5 para semanal/mensal/duração) como configuração isolada aqui. Trocar a escala de pontos no futuro é mudar essa tabela de configuração, não uma regra espalhada pelo código.

**Streak** — consome o resultado do Day Evaluation e atualiza streak atual e maior streak do participante, e também incrementa o contador de dias concluídos usado no desempate do ranking. Só ele sabe a regra "não bateu 3/3 = quebra"; os outros módulos não reimplementam essa lógica.

**Ranking** — apenas lê os campos agregados (streak atual, pontos, total de dias concluídos) já mantidos por Participants/Streak/Scoring e ordena por essa ordem de critérios (seção 2), com `participant_id` como desempate técnico final. Não recalcula nada; se o ranking ficar lento em escala, é aqui que entra cache, sem tocar nos módulos que calculam os valores.

**Analytics** — lê diretamente os valores reais registrados (não os campos de "cumpriu/não cumpriu") em Daily/Weekly/Monthly Records, agregando por período. É deliberadamente independente do Scoring e do Streak, porque a especificação exige que os totais reais apareçam mesmo em dias que não pontuaram.

A comunicação entre módulos dentro do mesmo processo pode ser feita com chamadas diretas de serviço para o caminho síncrono (ex.: "registrar valor e devolver se cumpriu ou não" precisa responder na hora, para a interface mostrar feedback imediato) e com eventos de domínio internos (ex.: `DiaAvaliado`, `MetaCumprida`) para os efeitos em cadeia (pontuação, streak), o que mantém Day Evaluation, Scoring e Streak desacoplados entre si mesmo rodando no mesmo processo — cada um reage ao evento do outro sem chamar o outro diretamente.

## 4. Como o histórico fica imune a mudanças futuras nas metas

Este é o ponto mais delicado da modelagem e vale destacar antes de entrar nas tabelas. A meta não é editada in-place: cada alteração relevante (mudar o valor-alvo, o tipo, a importância ou o texto) cria uma nova versão da meta, nunca sobrescreve a anterior. Um registro diário não referencia "a meta X"; ele referencia "a versão da meta X que estava vigente na data do registro", e além dessa referência, copia para dentro de si mesmo (desnormaliza) os campos que importam para exibição e para o cálculo — tipo, valor-alvo, importância — no momento em que o registro é criado.

Essa duplicação é intencional: mesmo que as linhas de versão de meta um dia sejam apagadas ou uma migração de dados saia errado, o registro histórico continua correto sozinho, porque carrega sua própria cópia congelada dos dados que precisa. Consultas de analytics e de perfil sempre leem esses campos copiados no registro, nunca a meta "atual", exceto quando a tela explicitamente mostra a configuração vigente (ex.: tela de edição da própria meta).

Na prática isso significa duas tabelas para "meta": uma tabela `Goal` que representa a meta em si (identidade estável ao longo do tempo, para o usuário conseguir "editar sua meta de estudar inglês" como um conceito contínuo) e uma tabela `GoalVersion` com o conteúdo em cada momento (valor-alvo, tipo, importância, vigente-de/vigente-até). Registros apontam sempre para uma `GoalVersion`, nunca só para a `Goal`.

Vale reforçar que essa imutabilidade (da definição da meta) é independente da imutabilidade do que o usuário lançou como valor realizado (seção 2). A primeira é garantida por versionamento; a segunda, agora que ficou definido que não existe edição nem preenchimento tardio de datas passadas, é garantida simplesmente bloqueando o endpoint de escrita para qualquer data que já passou — não precisa de nenhuma trava técnica adicional além dessa checagem de data.

## 5. Modelo de dados

Descrição das entidades principais e seus relacionamentos. Tipos exatos (enums completos, precisão numérica) ficam para a modelagem final do schema; aqui o objetivo é fechar quais tabelas existem e como se conectam.

| Entidade | Papel | Relaciona-se com |
|---|---|---|
| `User` | Conta de usuário. | 1—N `ChallengeParticipant` |
| `Challenge` | Um desafio: duração fixa, data de início, ID de entrada, criador. | 1—N `ChallengeParticipant` |
| `ChallengeParticipant` | Vínculo usuário↔desafio. Guarda os campos agregados de leitura: `current_streak`, `longest_streak`, `total_points`, `total_days_completed` (desempate do ranking — seção 2), data de entrada, e `status` (ativo/inativo — usado quando o participante sai do desafio, sem apagar nada). | N—1 `User`, N—1 `Challenge`; 1—N `Goal` |
| `Goal` | Identidade estável de uma meta de um participante. Guarda apenas `period_type` (diária/semanal/mensal/duração) e a qual participante pertence — o conteúdo vive em `GoalVersion`. | N—1 `ChallengeParticipant`; 1—N `GoalVersion` |
| `GoalVersion` | Conteúdo vigente de uma meta em um intervalo de tempo: `goal_kind` (horas/quantidade/sim-não), valor-alvo, importância, descrição, `vigente_de`/`vigente_ate`. | N—1 `Goal`; 1—N `DailyRecord` (e equivalentes semanal/mensal/duração) |
| `DailyRecord` | Um lançamento real de uma meta diária em uma data: valor realizado (numérico ou booleano), se cumpriu, snapshot copiado da `GoalVersion`, pontos atribuídos a este registro. | N—1 `GoalVersion`, N—1 `ChallengeParticipant` |
| `WeeklyRecord` / `MonthlyRecord` / `DurationRecord` | Mesma lógica do `DailyRecord`, para os períodos maiores; período coberto explícito (data início/fim) em vez de uma data única. | N—1 `GoalVersion`, N—1 `ChallengeParticipant` |
| `DayResult` | Um por participante por dia: quantas das 3 metas diárias foram cumpridas, se o dia foi concluído (3/3), e o valor do streak logo após esse dia. Existe para não recalcular a regra do streak a cada leitura. | N—1 `ChallengeParticipant` |
| `PointsLedger` | Lançamento append-only de pontos: de qual registro (diário/semanal/mensal/duração) veio, quantos pontos, quando. Nunca é atualizado nem apagado, só inserido — é o que permite auditar "de onde vieram meus pontos" e recalcular o total se algo divergir. | N—1 `ChallengeParticipant` |

O total de pontos e o streak em `ChallengeParticipant` são, estritamente falando, dados derivados (poderiam ser recalculados a partir de `PointsLedger` e `DayResult`), mas ficam desnormalizados ali de propósito para o ranking não precisar agregar a tabela inteira a cada consulta — a fonte da verdade continua sendo o ledger e o `DayResult`, e a atualização dos campos agregados acontece na mesma transação que gera o evento correspondente, para nunca ficarem dessincronizados.

Sobre a meta de duração: como o valor-alvo depende da data de entrada do participante (seção 2), o `target_value` da `GoalVersion` da meta de duração é calculado uma única vez, no momento em que o participante configura essa meta (dias restantes até o fim do desafio a partir de hoje), e nunca recalculado depois — não é necessário nenhum campo derivado adicional para isso.

Sobre o ID de entrada em um desafio: a especificação pede "criar ou entrar através de um ID"; ficou definido que basta ter o código para entrar, sem aprovação do criador (seção 2), o que reforça a necessidade tratada na seção 6 de o código ser não sequencial e longo o suficiente para não ser adivinhável.

## 6. Segurança e integridade dos dados

A cadeia registro → avaliação do dia → pontuação → streak precisa rodar dentro de uma única transação de banco: se a atualização de streak falhar depois que os pontos já foram gravados, o sistema fica inconsistente. Isso é direto de garantir em Postgres com Prisma, e é outro motivo para preferir um monólito com um único banco nesta fase.

Lançar um registro (diário, semanal etc.) deve ser uma operação idempotente por natureza — reenviar a mesma requisição (por exemplo, por uma falha de rede e retry automático do app) não pode gerar pontos em dobro. Na prática isso é um upsert por `(participant_id, goal_id, data)` em vez de um insert simples.

Autorização precisa impedir que um participante edite metas, registros ou veja campos administrativos de outro — o perfil é público na leitura (metas, histórico, streak, pontos, estatísticas) para qualquer usuário autenticado no aplicativo, mesmo fora de um desafio em comum (seção 2), mas escrita é sempre restrita ao dono do dado.

O ID de entrada em desafios merece atenção específica: como basta ter o código para entrar, sem aprovação do criador (seção 2), um identificador curto e previsível (sequencial, por exemplo) permitiria adivinhar códigos de outros desafios e entrar sem convite. Por isso o código deve ser não sequencial (aleatório, com comprimento suficiente), e o endpoint de entrada por código deve ter rate limit para dificultar tentativa por força bruta.

Toda entrada numérica de meta (horas, quantidade) deve ser validada no backend (não negativa, dentro de limites razoáveis) independente da validação de frontend, porque o cálculo de pontos e as agregações de analytics não podem confiar em dado não validado.

O `PointsLedger` funciona também como trilha de auditoria: qualquer divergência entre o total exibido e o esperado pode ser depurada somando o ledger, sem depender de logs externos.

Migrações de schema devem ser versionadas (o Prisma Migrate cobre isso) e nunca aplicadas diretamente em produção sem passar por um ambiente de homologação, dado que mudanças de schema aqui tocam diretamente a integridade do histórico.

## 7. Escalabilidade

Para o volume inicial, consultas diretas ao Postgres com os índices certos (por `participant_id` + data, por `challenge_id`) são suficientes tanto para os registros diários quanto para o ranking. Os pontos de atenção para quando o produto crescer:

O ranking, hoje pensado como leitura simples de dois campos já agregados em `ChallengeParticipant`, pode ganhar uma camada de cache (Redis, ou uma view materializada no próprio Postgres) por desafio, invalidada a cada mudança de streak ou pontos daquele desafio, em vez de recalculado a cada visualização — mas isso só se justifica depois que houver desafios com muitos participantes simultâneos consultando o ranking.

Analytics é a área com maior potencial de ficar pesada, porque agrega valores reais ao longo de séries temporais longas (até 365 dias por participante, por meta). A modelagem em `DailyRecord`/`WeeklyRecord`/etc. permite calcular tudo sob demanda no início; se isso ficar lento, o próximo passo natural é um job periódico que pré-agrega totais por semana/mês em uma tabela de resumo, sem mudar a tabela de registros brutos (que continua sendo a fonte da verdade e o que a tela "hoje" consulta diretamente).

A avaliação de metas semanais/mensais/de duração no fechamento do período (por exemplo, decidir à meia-noite de domingo se a meta semanal foi cumprida) é o tipo de trabalho que já nasce como job agendado (cron) em vez de calculado a cada leitura, o que também evita recalcular o mesmo fechamento toda vez que alguém abre o perfil.

A separação em módulos com fronteira clara (seção 3) é o que permite, se um módulo específico virar gargalo — mais provável Analytics — extraí-lo para um serviço e um banco de leitura próprios sem reescrever Challenges, Goals ou Scoring.

## 8. Estrutura de pastas inicial

Estrutura para um monólito Next.js (frontend) + NestJS (backend) em um monorepo, refletindo a separação de módulos da seção 3. Só a estrutura é proposta aqui — nenhuma pasta foi criada no ambiente ainda, isso acontece na próxima fase.

```
challenge-app/
├── apps/
│   ├── api/                        # backend NestJS
│   │   ├── src/
│   │   │   ├── challenges/         # módulo Challenges
│   │   │   ├── participants/       # módulo Participants
│   │   │   ├── goals/              # módulo Goals (inclui versionamento)
│   │   │   ├── records/            # módulo Daily/Weekly/Monthly/Duration Records
│   │   │   ├── day-evaluation/     # módulo Day Evaluation (regra do streak)
│   │   │   ├── scoring/            # módulo Scoring (tabela de pontos)
│   │   │   ├── streak/             # módulo Streak
│   │   │   ├── ranking/            # módulo Ranking
│   │   │   ├── analytics/          # módulo Analytics
│   │   │   ├── auth/               # autenticação e autorização
│   │   │   └── shared/             # eventos de domínio, tipos internos
│   │   └── prisma/
│   │       └── schema.prisma
│   └── web/                        # frontend Next.js
│       └── src/
│           ├── app/                # rotas
│           └── components/
├── packages/
│   └── shared-types/                # tipos de domínio compartilhados (enums de meta, duração, etc.)
└── docs/
    └── arquitetura-tecnica.md       # este documento
```

Com a API em REST (seção 1), cada módulo em `apps/api/src` expõe seus próprios controllers/DTOs; não há uma camada de resolvers separada como haveria em GraphQL.

## 9. Decisões pendentes

Nenhuma. As duas últimas (escala de pontos e desempate do ranking) foram resolvidas e já estão incorporadas na seção 2 e nos módulos Scoring/Ranking da seção 3. Este documento não depende mais de nenhuma escolha de negócio para avançar para o schema.

## 10. Próximos passos sugeridos

Com todas as decisões estruturais e de negócio fechadas, a sequência natural é: desenhar o `schema.prisma` completo a partir da seção 5 (já incorporando `status` e `total_days_completed` em `ChallengeParticipant`, o cálculo do valor-alvo da meta de duração, e a tabela de pontos da seção 2 como seed de configuração); provisionar o projeto no Supabase (banco + auth); e então iniciar a implementação do primeiro módulo (provavelmente Challenges + Goals, por serem pré-requisito dos demais).
