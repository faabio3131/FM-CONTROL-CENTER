# PROMPT MESTRE — EXECUÇÃO INTEGRAL DA CONCLUSÃO FUNCIONAL DO FM COMMAND
## RESTAURAÇÃO, RECONCILIAÇÃO, COMPLEMENTAÇÃO, INTEGRAÇÃO E CERTIFICAÇÃO
### FASE PRÉ-VISUAL PREMIUM — VISUAL PREMIUM EXPRESSAMENTE FORA DO ESCOPO

**Data de emissão:** 03/10/2026  
**Produto comercial:** FM Command  
**Identificador técnico/histórico:** FM Control Center / FMCC  
**Repositório oficial:** `faabio3131/FM-CONTROL-CENTER`  
**Objetivo:** deixar o FM Command funcionalmente completo, correto, íntegro, governado, integrado e certificado antes de qualquer nova tranche de Visual Premium.

---

# 0. ORDEM EXECUTIVA

VOCÊ É O EXECUTOR TÉCNICO DESTA MISSÃO.

Não produza outro prompt para um executor.
Não pare em planejamento abstrato.
Não peça “pode seguir?” entre PRs, blocos ou correções quando o escopo estiver claro.

Fluxo operacional obrigatório:

```text
CURRENT
→ reconciliar
→ implementar
→ corrigir
→ testar
→ certificar
→ revisar diff
→ mergear quando todos os gates obrigatórios estiverem verdes
→ recertificar pós-merge
→ próximo bloco
```

Continuar autonomamente até concluir todo o escopo interno possível desta missão.

Parar somente diante de:

1. autorização humana obrigatória de produção/F22;
2. credencial externa real indispensável que não esteja disponível;
3. decisão empresarial/semântica que não possa ser legitimamente inferida;
4. risco destrutivo ou irreversível não previamente autorizado;
5. conflito arquitetural que exija decisão humana;
6. dependência externa obrigatória ainda não certificada.

Quando houver blocker externo, NÃO abandonar a missão:
- registrar o blocker;
- continuar tudo que for independente;
- não fabricar provider, credencial, semântica ou evidência;
- retornar ao blocker quando ele for destravado.

---

# 1. MISSÃO

Restaurar a integridade funcional do FM Command e concluir todas as capacidades internas obrigatórias antes do Visual Premium.

A missão inclui:

- preservar o núcleo arquitetural íntegro;
- reconciliar regressões e branches posteriores;
- recuperar capacidades válidas sem importar a linha visual problemática;
- completar módulos ausentes;
- aprofundar Product Intelligence em um cockpit real por produto;
- completar Billing e Receivables;
- completar Operational Health;
- criar Activity Feed canônico;
- criar Global Search;
- criar Notifications Center;
- resolver gaps de RBAC/navegação;
- resolver semântica dos cards;
- integrar fontes/providers autorizados;
- revalidar Kordena e scheduler;
- completar capabilities do Core somente após existirem autoridades/read models;
- executar certificação funcional integral;
- produzir evidência e documentação reconciliada.

A missão termina em:

```text
FM COMMAND — FUNCTIONAL COMPLETION CERTIFIED
READY FOR FINAL VISUAL PREMIUM
```

O Visual Premium será uma missão posterior.

---

# 2. FORA DO ESCOPO

NÃO executar nesta missão:

- redesign global;
- reconstrução estética;
- alteração ampla de cores;
- troca de design system;
- animações cosméticas;
- “embelezamento” de telas;
- refatoração visual sem necessidade funcional;
- F22/produção pública;
- DNS/cutover produtivo;
- real-money transaction sem autorização explícita;
- criação de provider fictício;
- dados demonstrativos apresentados como reais.

UX/UI só pode ser alterada agora quando necessária para:

- restaurar funcionalidade;
- corrigir navegação;
- corrigir RBAC;
- adicionar módulo funcional;
- eliminar feedback enganoso;
- tratar loading/empty/error/unavailable;
- corrigir responsividade que bloqueie uso;
- garantir acessibilidade mínima;
- viabilizar teste/E2E.

---

# 3. AUTORIDADES OBRIGATÓRIAS

Antes de qualquer implementação, ler e respeitar nesta ordem:

1. `00-DOCUMENTO-MESTRE-NOVA-FM-TECNOLOGIA.md`;
2. `02-PADROES-DE-CONSTRUCAO-NOVA-FM.md`;
3. `FMCC-00-FUNDACAO-E-GOVERNANCA-v0.1.md`;
4. `FMCC-04-TARGET-E-SYSTEM-DESIGN-v0.2.md`;
5. `FMCC-05-ADRS-GOVERNANCA-DADOS-E-SEGURANCA-v0.1.md`;
6. documentação F06–F21;
7. ADRs vigentes;
8. `FM_COMMAND_AUDITORIA_PARIDADE_FUNCIONAL_PR28_2026-10-03.md`;
9. `FM_COMMAND_CRONOGRAMA_MESTRE_RESTAURACAO_FUNCIONAL_2026-10-03.md`;
10. código real da `main`;
11. PRs/branches posteriores relevantes;
12. testes, workflows, Render e demais evidências atuais.

Hierarquia:

```text
Documento Mestre
→ Padrões Nova FM
→ System Design/ADRs
→ contratos
→ implementação
→ evidências
→ auditoria
```

Se documentação e código divergirem:

- CURRENT técnico = evidência real;
- registrar divergência;
- nunca transformar TARGET em CURRENT;
- reconciliar documentação.

---

# 4. BASELINES CONHECIDAS — VERIFICAR AO VIVO ANTES DE USAR

## Repositório

```text
faabio3131/FM-CONTROL-CENTER
```

## Main conhecida em 03/10/2026

```text
f7535423d38751bbc38f6d7e5e6013a485bfcf0e
```

Mensagem:

```text
Merge pull request #31
fix(command): corrigir responsividade da tela de login premium
```

## Referência funcional histórica

PR #28:

```text
merge SHA:
b4a1b9cf163f5a0ecea0a5f703ff3aaba1c0c27a

HEAD certificado:
488a47f5884d3be807449cf10efa8a9a84efbf7a
```

A PR #28 é REFERÊNCIA DE PARIDADE, não branch de trabalho.

## Regra

Antes de executar:
- consultar GitHub novamente;
- não assumir que os SHAs acima continuam atuais;
- registrar o CURRENT vivo.

---

# 5. ESTADO ARQUITETURAL QUE DEVE SER PRESERVADO

O núcleo funcional não deve ser reconstruído.

Preservar obrigatoriamente:

- Better Auth / autenticação;
- TenantContext;
- memberships;
- RBAC contracts;
- Product Registry;
- product scope;
- Source Registry;
- Connector Runtime;
- canonical facts;
- sync executions;
- Metric Registry;
- Metric Engine;
- MetricValue;
- provenance/freshness/quality;
- FMCC Cognitive Vertical Core;
- Core Gateway;
- Product Intelligence;
- Financial Intelligence;
- Growth Intelligence;
- Operations Intelligence;
- Customer Intelligence;
- Alert Engine;
- governed action preview;
- Audit Ledger;
- Kordena Commercial Control;
- health/readiness;
- migrations e schema existentes;
- workflows/gates existentes.

Não criar arquitetura paralela para substituir nenhuma dessas autoridades.

---

# 6. INVARIANTES ARQUITETURAIS

## 6.1 Multi-tenancy

- tenant é fronteira obrigatória;
- tenant sempre resolvido server-side;
- header/body externo nunca amplia tenant;
- cross-tenant = STOP condition.

## 6.2 Product scope

- `product_id` deve ser validado pelo Product Registry;
- produto não amplia tenant;
- dados de um produto não contaminam outro.

## 6.3 Autoridade factual

Fluxo canônico:

```text
Source Authority
→ Integration Fabric
→ Canonical Fact / Read Model
→ Metric Registry
→ Metric Engine
→ Intelligence
→ Core
```

## 6.4 Core

O Core pode:
- consultar;
- correlacionar;
- explicar;
- resumir;
- comparar;
- sugerir;
- compor contexto.

O Core NÃO pode tornar-se autoridade de:
- tenant;
- RBAC;
- billing;
- payment;
- subscription;
- entitlement;
- pricing;
- receivable;
- provider configuration.

## 6.5 Ausência de dados

```text
missing != zero
```

Quando faltar dado:

```text
Indisponível
Fonte não conectada
Semântica pendente
External blocker
```

conforme o caso.

Nunca inventar zero.

## 6.6 Segredos

- nunca em código;
- nunca no Git;
- nunca no browser quando não estritamente necessário;
- nunca no Audit Ledger;
- credential provider em storage/Vault apropriado;
- service token separado de provider credential.

## 6.7 Configuração

Configuração crítica não pode ficar hardcoded.

Providers, ambientes, payment methods, routing e credential schema devem ser configuráveis ou derivados de registry/adapter quando aplicável.

---

# 7. ESTADO DAS PRs POSTERIORES — VERIFICAR AO VIVO

## PR #33

Known HEAD:

```text
883220a41d29f63054e8dd6d14a9234b17f27d40
```

Estado conhecido:
- OPEN/DRAFT;
- mergeable;
- Foundation PASS;
- F21 PASS.

Capacidades úteis:
- permission-aware navigation;
- server-side role resolution;
- onboarding guard;
- CommercialSourceResolver;
- correção de Kordena Commercial RBAC.

Regra:
- NÃO mergear a branch integralmente se carregar regressão visual;
- extrair/portar apenas alterações funcionais aprovadas.

## PR #35

Known HEAD:

```text
1105276a891cd868f8c42dab3d742ffb31931b48
```

Estado conhecido:
- OPEN/DRAFT;
- Cognitive PASS;
- F21 PASS;
- Foundation FAIL.

Material útil:
- semantic cards;
- Trials;
- Subscriptions;
- Settings;
- Operational Health.

Regra:
- NÃO usar como candidate de merge;
- auditar commits/diffs;
- portar/reimplementar seletivamente sobre linha limpa;
- corrigir causa real do Foundation FAIL quando a capacidade for reaproveitada.

## PR #36

Known HEAD:

```text
f1b68fdbf7e651839d4338cf36c9fbdc1e7169a6
```

Estado conhecido:
- OPEN;
- mergeable;
- Foundation PASS;
- Cognitive PASS;
- F21 PASS.

Escopo:
- Billing & Recebimentos configuráveis por produto;
- provider-driven configuration;
- PF/PJ;
- credential Vault path;
- connection test;
- activation;
- routing;
- step-up;
- audit.

Regra:
- preservar;
- antes de mergear, verificar dependência real do Kordena billing/control-plane;
- validar contrato cross-repository;
- não ativar conta real nem executar cobrança real.

## PR #37

Documentação de auditoria/restauração.

Known HEAD anterior a este prompt:

```text
182683bb675356b40d2f89199a2f39b4c32cca60
```

Estado conhecido:
- OPEN/DRAFT;
- Foundation PASS;
- F21 PASS.

---

# 8. ESTRATÉGIA DE BRANCHES E PRs

Não executar toda a restauração numa branch monolítica gigantesca.

Preferir PRs incrementais por domínio/capacidade.

Sequência recomendada:

```text
RC-01 — baseline + RBAC/navigation
RC-02 — semantic cards + Trials/Subscriptions/Settings
RC-03 — Operational Health
RC-04 — Product Cockpit
RC-05 — Billing integration
RC-06 — Receivables
RC-07 — Activity Feed
RC-08 — Search + Notifications
RC-09 — Sources/providers/semantics
RC-10 — Runtime Kordena/Scheduler
RC-11 — Core reconciliation
RC-12 — Functional Certification
```

Cada PR:

```text
implementar
→ testes locais/relevantes
→ push
→ exact-head CI
→ corrigir
→ recertificar
→ revisar diff
→ merge se todos gates obrigatórios estiverem verdes
→ pós-merge CI
→ próximo PR
```

Não perguntar autorização a cada merge funcional se:
- branch correta;
- escopo aprovado por este prompt;
- todos os gates obrigatórios verdes;
- nenhuma produção pública;
- nenhum segredo real;
- nenhuma operação financeira real;
- nenhuma mudança irreversível.

---

# 9. R0 — PREFLIGHT E CONGELAMENTO

Antes de escrever código:

1. consultar `main`;
2. consultar PRs abertas;
3. verificar branches relevantes;
4. verificar mergeability;
5. verificar workflows;
6. verificar Render Preview;
7. verificar banco/migrations;
8. verificar versão package;
9. inventariar rotas dashboard;
10. inventariar APIs;
11. inventariar domain/application/infrastructure;
12. reconciliar PR #28 × main;
13. reconciliar #33/#35/#36;
14. atualizar Mission Ledger.

Criar branch de execução limpa derivada do CURRENT real da main.

Nome recomendado:

```text
restore/fm-command-functional-completion
```

Se já existir, verificar se continua válida antes de reutilizar.

Gate R0:
- CURRENT comprovado;
- nenhuma alteração funcional ainda;
- plano de port por commit/diff registrado.

---

# 10. R1 — RBAC, NAVEGAÇÃO, ONBOARDING E SOURCE RESOLUTION

Recuperar da PR #33, após diff review:

- permission-aware navigation;
- role server-side;
- tenant membership resolution;
- onboarding guard;
- CommercialSourceResolver;
- Kordena Commercial sem dependência indevida de `source:read`.

Requisitos:

- sidebar não deve exibir destino proibido como se estivesse autorizado;
- esconder item não substitui backend RBAC;
- backend continua autoridade;
- owner/admin/member testados;
- tenant mismatch negado;
- forbidden states explícitos.

Testes mínimos:

- permission matrix;
- route denial;
- UI state;
- cross-tenant;
- Kordena commercial read sem source-admin;
- onboarding valid/invalid states.

Gate:
- Foundation;
- F21;
- security targeted;
- no visual redesign.

---

# 11. R2 — SEMÂNTICA DOS CARDS E KPIs

Auditar todos os labels executivos contra `metric_id`.

Corrigir divergências.

Exemplos:

```text
"Usuários" não pode esconder usage.active_users.dau
"Receita" não pode esconder revenue.cash_collected
"Testes" não pode esconder trial.starts.count
```

Cada card deve possuir, conforme aplicável:

- label correto;
- unidade;
- definição;
- período;
- scope;
- freshness;
- quality;
- source authority;
- status semântico;
- unavailable state.

Não alterar fórmula para encaixar UI.

Gate:
- nenhum card rotulado com significado mais amplo que a métrica real.

---

# 12. R3 — TRIALS, ASSINATURAS E SETTINGS

Usar a PR #35 como material de recuperação, não como branch de merge.

## Trials

Criar/recuperar módulo dedicado:

```text
/dashboard/trials
```

Exibir somente dados autorizados:

- trials iniciados;
- ativos quando semântica aprovada;
- expirados quando disponíveis;
- convertidos;
- conversão;
- coorte;
- produto;
- período;
- provenance.

Se `trial.active.count` ou `trial.conversion.rate` continuar semanticamente pendente:
- mostrar pendência;
- não inventar.

## Subscriptions

Criar/recuperar:

```text
/dashboard/subscriptions
```

Cobrir:

- active;
- cancelled;
- past_due quando autoridade real existir;
- product;
- plan;
- billing period;
- lifecycle state;
- source/provenance.

## Settings

Criar/recuperar:

```text
/dashboard/settings
```

Organizar:

- organization;
- users/roles;
- products;
- sources/integrations;
- security;
- billing links;
- operational configuration.

Settings não pode ser depósito de configuração hardcoded.

Gate:
- rotas;
- APIs/read models;
- permission states;
- empty/unavailable;
- E2E mínimo.

---

# 13. R4 — OPERATIONAL HEALTH REAL

A página de Operações já existe.

Não confundir:
- source registered;
- connector health;
- API health;
- service availability;
- uptime;
- incident.

Construir/recuperar um Service Health Read Model governado.

Cobertura alvo:

```text
FM Command
Kordena
IRON
CampaIA
future products
```

Campos mínimos:

- product/service;
- environment;
- current state;
- last checked;
- source authority;
- degraded reason;
- incident references;
- freshness;
- provenance.

Não inventar uptime.

Se ainda não houver observability provider:
- current health pode existir;
- uptime/SLO permanece unavailable.

Gate:
- Operations Intelligence deixa de depender apenas de source registry para representar “saúde da empresa”.

---

# 14. R5 — PRODUCT COCKPIT COMPLETO

Evoluir a F11 Product Intelligence.

A tela por produto não pode ser apenas três métricas.

Target:

```text
/dashboard/products/{productId}

Overview
Clientes
Trials
Assinaturas
Financeiro
Billing & Recebimentos
Saúde
Incidentes
Uso/Engajamento
Suporte
Fontes/Integrações
Alertas
Core contextual
```

Princípio:
- compor serviços/read models existentes;
- NÃO duplicar tabelas nem criar banco por página;
- product scope obrigatório;
- tenant scope obrigatório.

Para cada produto:
- Kordena;
- IRON;
- CampaIA;
- futuros produtos.

Se um produto não possui source:
- mostrar `Não conectado`;
- não preencher demo silencioso.

O cockpit deve suportar extensão por capabilities/provider.

Gate:
- mesma arquitetura para todos os produtos;
- sem condicionais hardcoded desnecessárias por nome de produto.

---

# 15. R6 — BILLING & RECEBIMENTOS POR PRODUTO

Integrar a PR #36 após confirmar seu CURRENT e dependências.

Antes do merge:

1. verificar Kordena billing/control-plane atual;
2. verificar PR/dependency cross-repository;
3. garantir compatibilidade;
4. executar testes de contrato.

Requisitos de Command:

- Billing Profile por produto;
- provider configurável;
- environment;
- PF/PJ;
- payment methods;
- recurrence/webhooks;
- priority/routing;
- provider-specific credential schema;
- encrypted secret path;
- test connection;
- status;
- audit;
- fresh step-up.

Não hardcode Mercado Pago como única arquitetura.

Mercado Pago pode ser primeiro adapter.

Separação obrigatória:

```text
PAGAMENTO OPERACIONAL KORDENA
cliente do restaurante → gateway do restaurante

BILLING SAAS FM
cliente da FM → assinatura do SaaS → provider FM → conta FM
```

Nunca misturar credenciais, ledger, tela ou recebimentos desses dois fluxos.

Nenhuma conta bancária/CPF/CNPJ real deve ser inventada.

---

# 16. R7 — RECEIVABLES LEDGER V1

Construir autoridade de contas a receber no domínio comercial adequado.

O Command NÃO deve criar um segundo ledger financeiro concorrente.

Entidade mínima:

```text
receivable_id
product_code
fm_customer_id
product_account_id
tenant_id
subscription_id
billing_period/competence
due_at
amount
currency
status
correlation_id
provenance
created_at
updated_at
```

Regras:

- issuance determinística;
- idempotência;
- uma obrigação não pode duplicar por retry;
- transaction allocation preserva identidade;
- provider webhook não escolhe customer interno;
- identity rebind proibido;
- overdue idempotente;
- product/tenant isolation;
- batch = agrupamento, não identidade.

Fluxo:

```text
Product Billing Profile
→ Customer
→ Product Account
→ Subscription
→ Receivable
→ Payment Transaction
→ Settlement/Reconciliation
→ Projection
→ Command Analytics
```

Command consome projeção/read model.

Testes obrigatórios:

- duplicate issuance;
- duplicate webhook;
- cross-customer;
- cross-product;
- cross-tenant;
- rebind denial;
- amount/currency mismatch;
- overdue;
- batch isolation.

---

# 17. R8 — UNIFIED OPERATIONAL ACTIVITY FEED

Criar projeção somente leitura.

Não usar alert occurrence como substituto de toda atividade empresarial.

Eventos elegíveis:

- customer created;
- trial started/converted/expired;
- subscription activated/cancelled/past_due;
- payment/receivable settlement;
- source connected/degraded;
- integration failure;
- incident;
- alert;
- support event;
- governed configuration change.

Campos:

- event id;
- type;
- tenant;
- product;
- actor/system;
- occurred_at;
- source;
- correlation;
- provenance;
- severity/category quando aplicável.

Não transformar Audit Ledger inteiro em feed automaticamente.

Gate:
- activity feed real;
- filtros;
- product scope;
- tenant scope;
- pagination;
- no fabricated event.

---

# 18. R9 — GLOBAL SEARCH

Criar busca funcional tenant-scoped.

Escopo V1:

- products;
- routes/modules;
- metrics;
- sources;
- alerts/incidents;
- customers quando houver autoridade;
- settings destinations.

Security rule:

```text
search result visibility <= direct resource visibility
```

Nunca revelar via busca entidade que a rota direta negaria.

Implementar:
- keyboard/search entry;
- results;
- grouping;
- empty;
- loading;
- unavailable;
- permission filters.

Não construir vetor/RAG complexo sem necessidade para V1.

---

# 19. R10 — NOTIFICATIONS CENTER

Criar Central de Notificações funcional.

Separar:
- Alert Rule;
- Alert Occurrence;
- Notification.

Notification pode derivar de:
- alerts;
- incidents;
- payment attention;
- source degraded;
- integration failure;
- subscription attention;
- security/config attention.

Requisitos:

- tenant scope;
- product scope;
- read/unread;
- timestamp;
- category;
- link seguro para destino;
- idempotência/dedup;
- pagination;
- audit conforme necessário.

Provider externo de e-mail/push/WhatsApp não é requisito para a Central in-app funcionar.

Não inventar envio externo.

---

# 20. R11 — 8 SEMÂNTICAS EXECUTIVAS

Resolver formalmente as definições pendentes:

1. `trial.active.count`;
2. `trial.conversion.rate`;
3. `subscription.logo_churn.rate`;
4. `revenue.mrr`;
5. `revenue.arr`;
6. `finance.operating_result` no catálogo executivo;
7. `finance.operating_margin.rate`;
8. `service.error.rate`.

Cada definição aprovada deve possuir:

- nome canônico;
- fórmula;
- numerator;
- denominator;
- population;
- time window;
- timezone;
- currency rules;
- inclusion/exclusion;
- source authority;
- missing-data behavior;
- aggregation;
- provenance.

Se decisão humana for necessária:
- produzir proposta técnica;
- NÃO ativar semântica como `implemented` por conta própria;
- continuar outras fases.

---

# 21. R11B — FONTES E PROVIDERS

Conectar ou formalizar decisão para:

- billing invoices;
- monetary receivables/delinquency;
- infrastructure FinOps;
- operating costs;
- CRM/leads;
- incident authority;
- service-error authority;
- usage telemetry;
- engagement;
- support.

Internal adapter candidates:

- job failures;
- integration failures.

Regra:
- não criar autoridade silenciosamente;
- adapter implementa capacidade do domínio;
- provider externo não define modelo interno;
- multi-provider quando trouxer benefício real.

Para cada source:

```text
authority
provider
auth
health
sync
canonical fact/read model
provenance
freshness
metric mapping
failure state
tests
runtime evidence
```

---

# 22. R12 — KORDENA RUNTIME E SCHEDULER

## Kordena

Revalidar ao vivo:

- `FMCC_KORDENA_CONTROL_TENANT_ID`;
- `FMCC_KORDENA_ALLOWED_ORIGINS`;
- `FMCC_KORDENA_CONTROL_PLANE_TOKEN`;
- `FMCC_KORDENA_BASE_URL` quando aplicável;
- source registered;
- health;
- sync;
- canonical facts;
- provenance;
- Metric Engine recompute;
- Core/UI cross-check.

Não registrar segredo.

## Scheduler

Revalidar:

- `FMCC_AUTOMATION_BASE_URL`;
- `FMCC_ALERT_AUTOMATION_SCHEDULER_SECRET`;
- workflow schedule;
- request auth;
- stale recovery;
- idempotency;
- audit.

Se secrets não estiverem disponíveis:
- manter fail-closed;
- registrar external blocker;
- não declarar ACTIVE.

---

# 23. R13 — RECONCILIAÇÃO FINAL DO CORE

Somente após os novos read models existirem.

Adicionar capabilities proporcionais para:

- product cockpit;
- receivables;
- health;
- activity;
- notifications;
- billing status;
- provider/source status.

Core deve responder perguntas como:

```text
Qual o MRR por produto?
Quais trials vencem?
Quais clientes estão past due?
Qual produto está degradado?
Quais recebíveis estão vencidos?
Quais integrações falharam?
Quais alertas exigem atenção?
```

Somente se as respectivas autoridades existirem.

Evidence Pack deve identificar:
- tenant;
- product;
- metric/fact/read model;
- source;
- timestamp;
- freshness;
- provenance.

---

# 24. R14 — CERTIFICAÇÃO FUNCIONAL INTEGRAL

Visual Premium continua proibido até este gate.

Executar no MESMO SHA candidato:

## Install/build

- `npm ci`;
- lint;
- TypeScript;
- schema/migration verify;
- migrations em banco isolado;
- production build;
- Docker build;
- dependency audit.

## Testes

- unit;
- integration;
- PostgreSQL;
- APIs;
- contracts;
- auth;
- RBAC;
- tenant;
- product isolation;
- metrics;
- finance;
- growth;
- operations;
- customers;
- alerts;
- automation;
- search;
- notifications;
- activity;
- product cockpit;
- billing;
- receivables;
- Core;
- adversarial;
- secret scan;
- runtime smoke;
- E2E.

## Segurança

Negativos obrigatórios:

- anonymous;
- forbidden role;
- cross-tenant;
- cross-product;
- stale step-up;
- provider secret leakage;
- unallowlisted origin;
- invalid source;
- identity rebind;
- duplicate webhook;
- malformed provider response.

## Inventário UI

Testar:
- todas as rotas;
- todos os botões;
- todos os links;
- todos os formulários;
- loading;
- empty;
- unavailable;
- error;
- forbidden.

Nenhum elemento visível pode parecer clicável e não funcionar.

---

# 25. GATE DE CONCLUSÃO FUNCIONAL

Só declarar:

```text
FM COMMAND — FUNCTIONAL COMPLETION CERTIFIED
READY FOR FINAL VISUAL PREMIUM
```

quando:

- R0–R14 completos;
- nenhuma regressão funcional conhecida;
- nenhum HIGH/CRITICAL aberto;
- todos os gates aplicáveis verdes;
- product cockpit completo;
- Trials/Subscriptions/Settings completos;
- Operational Health funcional;
- Activity Feed funcional;
- Search funcional;
- Notifications funcional;
- Billing control integrado;
- Receivables implementado;
- Core reconciliado;
- RBAC/tenant/product scope certificados;
- documentação real;
- external blockers explicitamente separados.

Esse status NÃO significa:
- produção;
- F22;
- real-money certification;
- Visual Premium concluído.

---

# 26. EXTERNAL BLOCKERS NÃO DEVEM IMPEDIR CONCLUSÃO INTERNA

Um provider/credencial pode permanecer external blocker somente se:

- código/adapter/contract interno estiver pronto;
- configuração estiver pronta;
- fail-closed estiver comprovado;
- UI declarar indisponível/não configurado;
- promessa comercial for coerente.

Se a capacidade for obrigatória para a promessa de lançamento:
- não declarar 100% comercial/produção;
- classificar exatamente o blocker.

---

# 27. COMMITS

Usar commits rastreáveis, por exemplo:

```text
fix(command): restore permission-aware navigation
feat(command): add governed trials workspace
feat(command): add subscriptions workspace
feat(command): add operational service health projection
feat(command): build product executive cockpit
feat(command): integrate product billing control
feat(command): add receivables ledger projection
feat(command): add unified operational activity
feat(command): add tenant-scoped global search
feat(command): add in-app notifications center
test(command): certify functional completion
docs(command): reconcile functional completion evidence
```

Evitar:
- update;
- final;
- fixes;
- changes.

---

# 28. PR E MERGE

Antes de merge:

- exact HEAD conhecido;
- mergeable;
- todos os required checks green;
- diff review;
- migrations revisadas;
- secrets scan;
- nenhum arquivo visual inesperado;
- nenhuma regressão de arquitetura;
- nenhuma evidência faltante essencial.

Merge somente o SHA certificado.

Após merge:
- confirmar merge SHA;
- reexecutar gates na main;
- verificar Render/Preview quando aplicável;
- registrar evidência;
- avançar automaticamente.

---

# 29. PROIBIÇÕES ABSOLUTAS

NÃO:

- force push;
- destructive rebase;
- apagar histórico útil;
- resetar main para PR #28;
- mergear #34/#35 cegamente;
- substituir arquitetura funcional por cópia visual;
- remover teste para ficar verde;
- usar skip/xfail para mascarar regressão;
- reduzir RBAC;
- criar tenant bypass;
- armazenar segredo em código;
- hardcode provider account;
- hardcode CPF/CNPJ/bank data;
- inventar cliente;
- inventar faturamento;
- inventar MRR/ARR;
- inventar health;
- inventar uptime;
- inventar provider;
- chamar Preview de produção.

---

# 30. DOCUMENTAÇÃO OBRIGATÓRIA DE EXECUÇÃO

Manter atualizados:

- README;
- Current/Target reconciliation;
- System Design se houver evolução;
- ADRs;
- Metric Registry docs;
- Source Coverage;
- Product Capability Matrix;
- Mission Ledger;
- migrations;
- runbooks;
- security evidence;
- deployment evidence;
- final functional certification.

Criar ao final:

```text
FM_COMMAND_FUNCTIONAL_COMPLETION_CERTIFICATION_2026-10-XX.md
```

Conteúdo:

A. repository/main/release candidate  
B. capabilities  
C. routes/APIs  
D. products/cockpits  
E. sources/providers  
F. metrics/semantics  
G. billing/receivables  
H. Core  
I. alerts/automation  
J. search/notifications/activity  
K. tests  
L. security  
M. migrations  
N. runtime/Preview  
O. external blockers  
P. exact final verdict.

---

# 31. MATRIZ DE RECUPERAÇÃO

| Origem | Tratamento |
|---|---|
| PR #28 | referência histórica funcional |
| main | base técnica vigente |
| PR #33 | portar segurança/navigation/resolver |
| PR #34 | não usar como base |
| PR #35 | extrair módulos funcionais seletivamente |
| PR #36 | preservar/integrar Billing |
| PR #37 | documentação de auditoria/restauração |
| cronograma pós-auditoria 02/10 | requisitos adicionais aceitos |

---

# 32. ORDEM DE EXECUÇÃO OBRIGATÓRIA

```text
R0  CURRENT/PREFLIGHT
↓
R1  SECURITY + NAVIGATION
↓
R2  SEMANTIC CARDS
↓
R3  TRIALS + SUBSCRIPTIONS + SETTINGS
↓
R4  OPERATIONAL HEALTH
↓
R5  PRODUCT COCKPIT
↓
R6  BILLING
↓
R7  RECEIVABLES
↓
R8  ACTIVITY FEED
↓
R9  GLOBAL SEARCH
↓
R10 NOTIFICATIONS
↓
R11 SEMANTICS + PROVIDERS
↓
R12 RUNTIMES
↓
R13 CORE RECONCILIATION
↓
R14 FUNCTIONAL CERTIFICATION
↓
STOP FUNCIONAL
↓
VISUAL PREMIUM EM MISSÃO SEPARADA
```

Etapas independentes podem avançar em paralelo quando seguro, mas não podem violar as dependências de autoridade.

---

# 33. RESPOSTA AO USUÁRIO DURANTE A MISSÃO

Não responder apenas:

- “executando”;
- “implementando”;
- “feito”;
- “pronto”.

Todo status deve conter evidência proporcional:

- PR;
- branch;
- commit;
- checks;
- testes;
- blockers;
- próximo item.

Não declarar conclusão sem prova.

---

# 34. VEREDITO FINAL PERMITIDO

Ao concluir esta missão, somente um dos dois:

## PASS

```text
FM COMMAND — FUNCTIONAL COMPLETION CERTIFIED
READY FOR FINAL VISUAL PREMIUM
```

## BLOQUEADO

```text
FM COMMAND — FUNCTIONAL COMPLETION BLOCKED
MOTIVO: [blocker exato]
INTERNAL COMPLETION: [estado real]
AÇÃO HUMANA MÍNIMA: [ação exata]
```

Nunca declarar 100% comercialmente disponível nesta missão.

A produção pertence à F22 e exige autorização humana própria.

---

# 35. INSTRUÇÃO FINAL

COMECE AGORA PELO CURRENT REAL.

Não conserte o Preview visual quebrado como estratégia principal.

Não reconstrua o sistema do zero.

Preserve o núcleo.
Recupere seletivamente o que foi construído depois.
Complete os gaps reais.
Conecte fontes reais quando autorizadas.
Teste tudo.
Certifique tudo.

Somente quando o FM Command estiver funcionalmente íntegro e certificado, encerre esta missão e libere a próxima:

```text
FINAL VISUAL PREMIUM
```
