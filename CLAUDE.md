# CLAUDE.md

Este arquivo é a principal fonte de contexto do projeto para o Claude Code. Leia-o por completo, junto com `docs/IMPLEMENTATION_PLAN.md`, antes de implementar qualquer coisa.

## 1. Produto

Aplicativo de desafios entre amigos. Resumo do funcionamento:

- Usuários podem criar um desafio.
- Outros usuários entram em um desafio através do ID/código do desafio.
- Cada desafio tem duração fixa: **30, 50, 100 ou 365 dias**.
- Cada participante configura suas próprias metas dentro do desafio.
- Existe um sistema de pontuação por meta cumprida.
- Existe streak (sequência de dias consecutivos com as metas diárias cumpridas).
- Existe ranking entre os participantes de um desafio.
- Perfis de participantes são públicos dentro do app.
- Existe histórico imutável dos registros de cada participante.
- Existem análises (analytics) dos hábitos registrados.

Documentação de referência completa (não resumir nem substituir — consultar sempre que precisar de detalhe):

- `docs/arquitetura-tecnica.md` — arquitetura geral, stack, módulos, modelo de dados, decisões de negócio.
- `docs/database-schema.md` — schema real implementado no Supabase/PostgreSQL: tabelas, enums, constraints, índices, RLS, funções/triggers, jobs agendados.

## 2. Regras de negócio já definidas

As regras abaixo já foram decididas e **não podem ser reinterpretadas, simplificadas ou alteradas** durante a implementação das próximas etapas. Qualquer mudança de regra de negócio exige confirmação explícita do usuário antes de codificar.

### Metas

Cada participante possui, por desafio:

- **3 metas diárias obrigatórias**.
- **1 meta semanal opcional**.
- **1 meta mensal opcional**.
- **1 meta referente à duração total do desafio** (opcional).

Tipos de meta (qualquer uma das 4 categorias acima pode ser de qualquer um destes tipos):

- **horas**
- **quantidade**
- **sim/não** (booleana)

Importância da meta (afeta pontuação, não afeta streak):

- **baixa**
- **média**
- **alta**

Quem entra em um desafio já iniciado tem a meta de duração recalculada para os dias restantes a partir da data de entrada (ex.: entrar no dia 10 de um desafio de 30 dias gera uma meta de duração de 20 dias, não de 30).

Semana e mês (para metas semanais/mensais) seguem o calendário civil: semana de segunda a domingo, mês do dia 1 ao último dia — não são períodos relativos ao início do desafio.

O banco garante o teto de metas diárias (nunca mais que 3, via trigger); a aplicação é responsável por garantir o piso (bloquear o desafio como "não configurado" até as 3 existirem) — ver `docs/database-schema.md`.

### Cumprimento de metas

Para metas do tipo **horas** e **quantidade**:

- `actual_value >= target_value` → meta concluída.
- Se o valor registrado for **menor** que o alvo:
  - meta **não concluída**;
  - **não recebe pontos**;
  - o valor real registrado permanece salvo (usado em analytics).
- Se o valor registrado for **maior** que o alvo:
  - meta **concluída**;
  - recebe **somente os pontos normais** (sem bônus por exceder);
  - o valor excedente continua registrado normalmente para analytics.

Para metas do tipo **sim/não**: apenas concluída ou não concluída, sem valor numérico.

Um dia sem nenhum registro lançado é 0/3 automaticamente — sem tolerância, sem ação explícita necessária do participante.

### Pontos

Pontos são concedidos apenas pelo cumprimento de cada meta individual (não há pontuação parcial nem proporcional).

Escala já definida (não é decisão pendente — está implementada em `points_config`, ver `docs/database-schema.md` e `docs/arquitetura-tecnica.md` seção 2):

| Importância | Diária | Semanal (×3) | Mensal (×4) | Duração do desafio (×5) |
|---|---|---|---|---|
| Alta | 30 | 90 | 120 | 150 |
| Média | 20 | 60 | 80 | 100 |
| Baixa | 10 | 30 | 40 | 50 |

Trocar esses valores no futuro é uma alteração de dados na tabela `points_config`, nunca uma mudança de regra de código.

### Streak

O streak depende **exclusivamente** das 3 metas diárias obrigatórias:

- **3/3 metas diárias cumpridas no dia** → dia concluído, streak **+1**.
- **2/3, 1/3 ou 0/3** → dia não concluído, streak **quebra (volta a 0)**.

Metas semanais, mensais e de duração do desafio **nunca** quebram o streak e **nunca** contribuem para ele — elas só geram (ou deixam de gerar) pontos.

Existem dois valores armazenados por participante:

- **streak atual** (`current_streak`);
- **maior streak histórico** (`longest_streak`).

O maior streak é apenas informativo e **não** influencia o ranking.

O fechamento do dia (decisão de streak) roda uma única vez, via job agendado, depois que o dia já virou passado e não aceita mais edições — nunca é decidido em tempo real a cada registro, para o streak não oscilar visualmente durante o dia.

### Ranking

A classificação prioriza, nesta ordem:

1. **streak atual**;
2. **pontos totais**;
3. **total de dias concluídos no desafio inteiro** (soma de todos os dias 3/3, não só o streak atual) — critério de desempate adicional já definido em `docs/arquitetura-tecnica.md` seção 2, usado apenas se os dois primeiros critérios empatarem;
4. `participant_id` — desempate puramente técnico, apenas para a lista ficar estável entre consultas, se os três critérios acima empatarem (matematicamente raro).

O **maior streak histórico nunca é usado** como critério de ranking, em nenhuma hipótese.

### Histórico

O histórico deve preservar os valores e a configuração da meta exatamente como estavam no momento em que o registro foi feito. Alterações futuras em uma meta (valor-alvo, tipo, importância, título) **não podem alterar retroativamente** registros já existentes.

Isso é garantido pelo padrão de versionamento `Goal`/`GoalVersion`: metas nunca são editadas in-place, uma edição fecha a versão vigente e abre uma nova; cada registro referencia uma `goal_version_id` específica e copia (snapshot) os campos relevantes no momento do registro. Ver seção 4 de `docs/arquitetura-tecnica.md` e a documentação de `goal_versions` em `docs/database-schema.md`.

O participante também não pode editar nem preencher retroativamente um registro de uma data já passada — não existe atualização retroativa nem preenchimento tardio, em nenhuma meta (diária, semanal, mensal ou de duração).

### Analytics

Analytics usam sempre os **valores reais registrados**, mesmo quando a meta não foi concluída — nunca apenas o campo de cumprido/não cumprido.

Exemplo: meta de 5h/dia, com registros de 5h, 3h e 7h → analytics soma **15h**, mesmo que o registro de 3h não tenha gerado pontos (ficou abaixo do alvo) e o de 7h tenha gerado apenas os pontos normais (sem bônus pelo excedente).

### Perfis

Perfis são **públicos** para qualquer usuário autenticado no aplicativo, mesmo sem participação em nenhum desafio em comum. Qualquer usuário pode visualizar metas, histórico, resultados, streak, pontos e análises de outros participantes.

### Outras regras já confirmadas

- Basta ter o código/ID do desafio para entrar — não há aprovação do criador. O código é não sequencial e difícil de adivinhar.
- Sair de um desafio marca o vínculo como inativo (não apaga nada): some do ranking ativo, não pode mais registrar, mas histórico, pontos e streaks permanecem intactos e consultáveis no perfil.
- O fechamento de dia/período usa um fuso horário fixo do servidor (`America/Sao_Paulo`) para todos os participantes, independente do fuso de cada um.

## 3. Stack e arquitetura (resumo — detalhes em `docs/arquitetura-tecnica.md`)

- TypeScript de ponta a ponta.
- Backend: NestJS (monólito modular), API REST.
- Banco: PostgreSQL via Supabase (Supabase usado apenas como Postgres gerenciado + Auth — não se usa a API automática do Supabase/PostgREST como camada pública; o NestJS é a única porta de entrada da aplicação).
- ORM: Prisma.
- Frontend: Next.js (App Router).
- Autenticação: Supabase Auth.
- Módulos do backend: Challenges, Participants, Goals, Records (Daily/Weekly/Monthly/Duration), Day Evaluation, Scoring, Streak, Ranking, Analytics.

A camada de banco de dados (etapa 2 do plano) já está implementada e testada — ver `docs/database-schema.md` para o schema completo, incluindo RLS, triggers e jobs de fechamento.

## 4. Como o desenvolvimento deve prosseguir a partir daqui

O desenvolvimento é feito **uma etapa por vez**, seguindo `docs/IMPLEMENTATION_PLAN.md`. Quando o usuário disser algo como **"Implemente a etapa N do plano"**, o Claude Code deve seguir exatamente esta sequência:

1. Ler este `CLAUDE.md` por completo.
2. Ler `docs/IMPLEMENTATION_PLAN.md` por completo.
3. Verificar o estado atual do projeto (código, schema, migrations existentes) antes de escrever qualquer linha nova.
4. Identificar com precisão o que pertence à etapa N — e **somente** o que pertence a ela.
5. **Não implementar etapas futuras.** Se a etapa N depender de infraestrutura de uma etapa futura, criar apenas o mínimo necessário para a etapa N funcionar, sem antecipar a funcionalidade completa da etapa futura.
6. **Não modificar regras de negócio já definidas** neste documento ou em `docs/arquitetura-tecnica.md`.
7. Se, durante a implementação, for encontrada uma decisão de negócio que não foi definida em nenhum documento, **parar e perguntar ao usuário** antes de inventar uma regra. Nunca assumir um comportamento não documentado.
8. Implementar a etapa completamente.
9. Testar a implementação (testes automatizados quando fizer sentido; no mínimo, verificação manual/funcional documentada na PR).
10. Atualizar o checklist em `docs/IMPLEMENTATION_PLAN.md` — **somente** depois que a etapa estiver de fato concluída, testada e sem bloqueadores conhecidos (ver seção 7 abaixo).
11. Criar a branch correspondente à etapa (ver padrão de nomenclatura abaixo).
12. Fazer commit(s) claros e específicos da etapa.
13. Criar Pull Request da branch da etapa para a branch principal (`main`).
14. Fazer merge da PR **depois** que a implementação e os testes estiverem corretos.
15. Garantir que a branch principal fique em estado funcional após o merge.

### Proteção contra escopo

**Implementar somente a etapa solicitada.** Nunca adiantar etapas futuras "já que está mexendo ali". Se uma etapa depender de algo de uma etapa posterior, usar apenas a infraestrutura mínima necessária (ex.: um campo, uma tabela vazia, um stub), nunca a funcionalidade futura completa.

## 5. Padrão de branches

Uma branch por etapa, nunca reaproveitar a branch de uma etapa anterior. Padrão:

```
feature/step-03-authentication
feature/step-04-challenges
feature/step-05-goals-setup
feature/step-06-daily-records
...
```

Use o número da etapa com dois dígitos e um slug curto em inglês, consistente com o nome da etapa em `docs/IMPLEMENTATION_PLAN.md`.

## 6. Commits

Commits claros, profissionais e específicos da etapa em andamento. Cada commit deve explicar o que foi implementado.

Evitar mensagens genéricas como `update`, `changes`, `stuff`, `wip`.

Preferir o padrão: `feat(step-03): implementa login e cadastro via Supabase Auth`.

## 7. Pull Requests

Cada etapa gera exatamente uma Pull Request (branch da etapa → `main`). A descrição da PR deve conter:

- objetivo da etapa;
- funcionalidades implementadas;
- alterações importantes (schema, endpoints, contratos, etc.);
- testes realizados;
- decisões pendentes encontradas (se houver).

Só fazer merge depois de validar que a implementação e os testes estão corretos.

## 8. Checklist (`docs/IMPLEMENTATION_PLAN.md`)

O arquivo de plano funciona como fonte de acompanhamento do projeto. Uma etapa só pode passar de `[ ]` para `[x]` depois de, **todos** os itens abaixo estarem satisfeitos:

- implementação completa da etapa;
- testes realizados;
- integração validada com o restante do projeto;
- ausência de problemas conhecidos que bloqueiem o uso da funcionalidade.

Escrever código não é suficiente para marcar uma etapa como concluída.

## 9. Banco de dados

O banco de dados (Supabase/PostgreSQL) já está implementado e documentado em `docs/database-schema.md` (etapa 2, concluída). A partir de agora:

- **não recriar** o banco nem as migrations existentes;
- **não apagar** tabelas existentes;
- **não substituir** migrations já aplicadas — alterações de schema são sempre novas migrations, nunca edições retroativas das existentes;
- **não fazer mudanças destrutivas** sem necessidade clara e sem avisar antes;
- **respeitar o schema existente**, incluindo RLS, triggers, constraints e a lógica de versionamento imutável de metas;
- antes de alterar qualquer estrutura existente, ler `docs/database-schema.md` e a migration relevante para entender o que já existe.

## 10. Onde estão as coisas

```
evoluo/
├── CLAUDE.md                        # este arquivo
├── docs/
│   ├── arquitetura-tecnica.md       # arquitetura, stack, decisões de negócio, modelo de dados
│   ├── database-schema.md           # schema real implementado (tabelas, RLS, triggers, cron)
│   └── IMPLEMENTATION_PLAN.md       # checklist de etapas do projeto
└── supabase/
    ├── config.toml
    ├── verify_migrations.sql        # script de verificação pós-deploy das migrations
    └── migrations/                  # migrations SQL já aplicadas (etapa 2, concluída)
```
