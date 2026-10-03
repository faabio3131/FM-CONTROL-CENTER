# FM COMMAND — CRONOGRAMA MESTRE DE RESTAURAÇÃO E CONCLUSÃO FUNCIONAL

**Data:** 03/10/2026  
**Produto:** FM Command  
**Base de auditoria:** PR #28 / `b4a1b9cf163f5a0ecea0a5f703ff3aaba1c0c27a`  
**Base técnica recomendada para execução:** `main@f7535423d38751bbc38f6d7e5e6013a485bfcf0e`  
**Motivo:** o dashboard funcional da PR #28 é idêntico ao da main até PR #31; a main preserva correções posteriores de login sem alterar domain/application/infrastructure.  
**Visual Premium:** deliberadamente posterior à estabilização funcional.  
**Produção:** não autorizada.  
**Objetivo:** completar o FM Command sem reconstruir o núcleo preservado e sem transportar regressões das PRs #32–#35.

---

# 1. PRINCÍPIO EXECUTIVO

A restauração não será:

```text
PR #34 quebrada
→ consertar CSS
→ tentar recuperar funções
```

Será:

```text
main preservada
→ reconciliar capacidades úteis posteriores
→ completar gaps reais
→ integrar providers/fontes
→ certificar funcionalidade
→ só depois Visual Premium
→ auditoria
→ readiness
→ F22 autorizado
```

---

# 2. BASELINE DE ENTRADA

## Preservado

- Auth;
- multi-tenancy;
- RBAC backend;
- Source Registry;
- Connector Runtime;
- Canonical Facts;
- Metric Registry;
- Metric Engine;
- Provenance;
- Product Registry;
- Product Intelligence;
- FMCC Vertical Cognitive Core;
- Finance Intelligence;
- Growth Intelligence;
- Operations Intelligence;
- Customer Intelligence;
- Alert Engine;
- Governed Action Preview;
- Audit Ledger;
- Kordena Commercial Control;
- health/readiness;
- CI/gates;
- backup/restore readiness histórico.

## Fragmentado fora da baseline

- RBAC/navigation/onboarding fixes — PR #33;
- semantic cards — PR #35;
- Trials — PR #35;
- Subscriptions — PR #35;
- Settings — PR #35;
- Operational Health — PR #35;
- Product Billing Control — PR #36;
- documentação de restauração — PR #37.

## Ainda inexistente ou incompleto

- Product Cockpit completo;
- Receivables;
- Activity Feed canônico;
- Global Search;
- Notifications;
- provider coverage;
- 8 semantic definitions;
- scheduler runtime;
- F22.

---

# 3. REGRAS DE EXECUÇÃO

1. Trabalhar sobre branch limpa derivada da main.
2. PR #28 é referência funcional/visual histórica, não branch de desenvolvimento.
3. Não mergear #32–#35 integralmente.
4. Extrair alterações úteis por capacidade.
5. Cada etapa deve terminar com testes e diff review.
6. Nenhuma source/provider será inventada.
7. Nenhuma métrica semântica será decidida silenciosamente.
8. Missing continua diferente de zero.
9. Core continua não autoritativo para billing, tenant, RBAC ou pagamentos.
10. Nenhuma nova arquitetura paralela.
11. Visual somente após o Functional Gate.
12. Exact-SHA em CI, Preview e homologação final.
13. Produção somente em F22 após autorização humana.

---

# 4. CRONOGRAMA MACRO

| Fase | Janela indicativa | Entrega | Dependência |
|---|---:|---|---|
| R0 | D0 | congelamento do baseline e branch limpa | nenhuma |
| R1 | D1–D2 | segurança/navegação/onboarding/resolver | R0 |
| R2 | D1–D3 | semântica atual dos cards e contratos de apresentação | R0 |
| R3 | D2–D5 | Trials, Subscriptions e Settings | R1/R2 |
| R4 | D3–D6 | Operational Health governado | R1 |
| R5 | D4–D8 | Product Cockpit completo | R3/R4 |
| R6 | D4–D7 | Billing por produto — integração PR #36 | R1 |
| R7 | D6–D10 | Receivables + projeção no Command | R6 |
| R8 | D6–D10 | Unified Activity Feed | R3/R4 |
| R9 | D8–D11 | Global Search tenant-scoped | R3/R5 |
| R10 | D8–D12 | Notifications Center | R4/R8 |
| R11 | D3–D14 | semânticas executivas + provider/source coverage | decisões externas |
| R12 | D10–D14 | Kordena runtime + scheduler + integrations revalidation | R6/R11 |
| R13 | D14–D16 | Core capabilities/read models finais | R5–R12 |
| R14 | D16–D18 | Functional Certification Gate | R1–R13 |
| R15 | D18–D21 | Visual Premium final | R14 |
| R16 | D21–D23 | certificação integral pós-visual | R15 |
| R17 | D23–D24 | Audit & Fix independente | R16 |
| R18 | D24–D26 | exact-SHA Preview/Readiness | R17 |
| F22 | após H4 | produção e certificação | autorização humana |

**Estimativa interna:** aproximadamente 20–26 dias úteis de execução, excluindo espera por credenciais, provider decisions, semânticas empresariais e aprovação de produção.

As fases tecnicamente independentes podem ser executadas em paralelo quando não criarem conflito de branch ou autoridade.

---

# 5. R0 — CONGELAMENTO DO BASELINE

## Entrega

Criar branch única:

```text
restore/fm-command-functional-completion
```

a partir de:

```text
main@f7535423d38751bbc38f6d7e5e6013a485bfcf0e
```

## Provas

- branch base;
- tree limpo;
- inventário rotas;
- APIs;
- domain/application/infra;
- workflows;
- migrations;
- PRs #32–#36 classificadas.

## Gate

Nenhuma alteração funcional antes do inventário reconciliado.

---

# 6. R1 — SEGURANÇA, RBAC E NAVEGAÇÃO

## Fonte de recuperação

PR #33.

## Portar/reimplementar

- permission-aware navigation;
- tenant/role server-side no layout;
- onboarding guard;
- `CommercialSourceResolver`;
- Kordena Commercial sem dependência acidental de `source:read`.

## Testes

- owner/admin;
- member sem permission;
- forbidden routes;
- tenant mismatch;
- no privilege by UI;
- Kordena commercial read independent from source admin.

## Gate

Backend e UI devem concordar sobre autoridade.

---

# 7. R2 — SEMÂNTICA DOS CARDS

## Problema

Rótulos executivos simplificados não podem mascarar a métrica real.

Exemplos já encontrados:

- “Usuários” não deve ocultar que é DAU;
- “Receita” não deve ocultar cash collected;
- “Testes” não deve ocultar trial starts.

## Entrega

- labels canônicos;
- tooltip/definition;
- status implemented/pending;
- source/freshness/quality;
- nenhuma métrica visual substituta.

## Fonte

Partes do commit semântico da PR #35 podem ser reaproveitadas após review.

---

# 8. R3 — TRIALS, ASSINATURAS E CONFIGURAÇÕES

## Trials

Construir superfície dedicada para:

- iniciados;
- ativos;
- encerrados;
- conversão;
- coorte;
- produto;
- período;
- provenance.

Não inventar active/conversion enquanto semântica estiver pendente.

## Assinaturas

- ativas;
- canceladas;
- past due quando autoridade existir;
- produto;
- plano;
- período;
- status.

## Settings

Centro governado para:

- organização;
- usuários/papéis;
- produtos;
- integrations/sources;
- security;
- billing configuration links;
- operational configuration.

## Fonte

PR #35 possui primeira implementação.

**Ação:** portar para branch limpa e evoluir.

---

# 9. R4 — OPERATIONAL HEALTH

## Fonte

Operational Health da PR #35.

## Target

Criar autoridade somente leitura consolidada:

```text
FM Command
Kordena
IRON
CampaIA
future SaaS
```

por:

- service;
- environment;
- current state;
- last check;
- source authority;
- incidents;
- degraded/unavailable;
- provenance.

## Regra

Source registration não equivale a service health.

Health pontual não equivale a uptime.

---

# 10. R5 — PRODUCT COCKPIT

Esta é uma entrega central.

Todo produto ativo deverá possuir:

```text
/dashboard/products/{productId}
├── overview
├── customers
├── trials
├── subscriptions
├── finance
├── billing/receivables
├── health
├── incidents
├── usage
├── support
├── integrations
├── alerts
└── contextual Core
```

## Arquitetura

Não duplicar domínios.

O cockpit compõe read models/serviços existentes com product scope.

## Gate

Kordena, IRON, CampaIA e futuro produto usam a mesma arquitetura de cockpit.

Dados ausentes mostram indisponível.

---

# 11. R6 — BILLING POR PRODUTO

## Fonte

PR #36 — linha limpa e verde.

## Integrar

- product Billing page;
- Billing Control Panel;
- provider-driven options;
- PF/PJ;
- credential Vault;
- connection test;
- status activation;
- routing;
- step-up;
- audit.

## Regra

SaaS billing FM:

```text
cliente FM
→ assinatura do produto
→ provider billing FM
→ conta recebedora FM
```

nunca misturado com pagamentos operacionais dos clientes Kordena.

---

# 12. R7 — RECEIVABLES

Construção necessária.

## Entidade canônica mínima

- receivable_id;
- product_code;
- fm_customer_id;
- product_account_id;
- tenant_id;
- subscription_id;
- billing period;
- due_at;
- amount;
- currency;
- status;
- correlation/provenance.

## Regras

- emissão determinística;
- idempotência;
- sem duplicação da mesma obrigação/período;
- alocação transaction → receivable;
- overdue tenant/product scoped;
- batch nunca substitui identidade;
- provider não define customer interno.

## Command

Command não cria segundo ledger financeiro. Recebe fatos/projeções canônicas da autoridade comercial.

---

# 13. R8 — UNIFIED ACTIVITY FEED

Criar projeção somente leitura para eventos de negócio e operação.

Eventos iniciais:

- trial started/converted/expired;
- subscription activated/cancelled/past_due;
- payment;
- incident;
- integration failure;
- alert;
- support;
- relevant governed configuration change.

## Regras

- tenant scope;
- product scope;
- provenance;
- timestamp;
- source;
- correlation;
- no second source of truth.

---

# 14. R9 — GLOBAL SEARCH

Busca V1 tenant-scoped sobre:

- products;
- modules/routes;
- metrics;
- sources;
- customers quando autoridade permitir;
- alerts/incidents;
- settings destinations.

## Segurança

Resultado só pode conter entidade que o usuário poderia acessar diretamente.

---

# 15. R10 — NOTIFICATIONS CENTER

Construir uma central real, separada do Alert Engine.

Possíveis categorias:

- alert occurrence;
- incident;
- integration failure;
- subscription/payment attention;
- provider/source degraded;
- system configuration attention.

## Não fazer

Não converter todo Audit Ledger em notification.

Não enviar externamente sem provider/policy.

---

# 16. R11 — SEMÂNTICAS E PROVIDERS

Esta tranche possui dependências humanas/externas.

## Semânticas

Resolver formalmente:

1. trial active;
2. trial conversion;
3. churn;
4. MRR;
5. ARR;
6. operating result executive target;
7. operating margin;
8. service error rate.

## Providers/fontes

Definir ou conectar:

- billing invoices;
- monetary receivables/delinquency;
- infrastructure FinOps;
- operating costs;
- CRM/leads;
- incidents;
- service errors;
- usage telemetry;
- support.

## Internal adapters

Decidir autoridade para:

- job failures;
- integration failures.

## Gate

Nenhum provider escolhido por conveniência de implementação.

---

# 17. R12 — RUNTIME REAL / INTEGRAÇÕES

## Kordena

Revalidar:

- control tenant;
- allowlist;
- dedicated token;
- base URL;
- source registration;
- health;
- sync;
- canonical facts;
- provenance;
- recompute;
- Core/UI cross-check.

## Scheduler

Revalidar:

- automation base URL;
- scheduler secret;
- periodic execution;
- audit;
- retry/recovery.

## Demais produtos

Adicionar connectors/sources seguindo a Integration Fabric, não atalhos SQL.

---

# 18. R13 — CORE FINAL

Depois dos read models e sources:

- expandir capabilities;
- product cockpit context;
- activity context;
- health context;
- finance/receivables context;
- billing configuration status;
- notifications explanation.

## Regra

Core interpreta.

Serviços determinísticos continuam decidindo.

---

# 19. R14 — FUNCTIONAL CERTIFICATION GATE

Antes de Visual Premium:

Executar no mesmo SHA:

- npm ci;
- lint;
- typecheck;
- migration/schema verify;
- migrations isoladas;
- unit;
- integration;
- PostgreSQL;
- API;
- cross-tenant;
- RBAC negatives;
- E2E;
- Core adversarial;
- secret scan;
- runtime smoke;
- Docker;
- dependency audit;
- route/button inventory.

## Veredito permitido

```text
FM COMMAND — FUNCTIONAL COMPLETION CERTIFIED
READY FOR FINAL UX/UI
```

Somente se 100% do escopo interno obrigatório estiver verde ou explicitamente classificado como external blocker.

---

# 20. R15 — VISUAL PREMIUM FINAL

Somente agora.

Requisitos:

- preservar contracts;
- preservar rotas;
- preservar handlers;
- preservar RBAC;
- preservar data semantics;
- desktop/tablet/mobile;
- accessibility;
- no decorative fake functionality;
- screenshots exact-SHA.

PR visual não poderá alterar domain/application/infrastructure sem finding técnico separado.

---

# 21. R16 — FULL TECHNICAL CERTIFICATION

Reexecutar toda matriz após visual.

Nenhuma aprovação visual substitui regressão técnica.

---

# 22. R17 — INDEPENDENT AUDIT & FIX

Nova auditoria independente sobre SHA congelado.

Revisar:

- architecture;
- authorization;
- tenant/product scope;
- provider boundaries;
- money flows;
- Core boundaries;
- UI contracts;
- E2E;
- supply chain;
- deployment identity;
- runtime.

Corrigir e recertificar.

---

# 23. R18 — EXACT-SHA READINESS

Fluxo:

```text
candidate final
→ CI green
→ exact-SHA Preview
→ migration
→ health
→ readiness
→ auth protection
→ critical journeys
→ product journeys
→ billing control read-only
→ backup/restore
→ rollback
→ evidence
```

---

# 24. F22 — PRODUÇÃO

Somente após H4/autorização humana.

Inclui:

- production deploy;
- migrations;
- DNS/domain;
- production secrets;
- sources/providers;
- post-deploy smoke;
- monitoring;
- rollback readiness;
- final certification.

---

# 25. MATRIZ DE REUSO

| Fonte | Uso |
|---|---|
| PR #28 | referência funcional histórica |
| main | base técnica da restauração |
| #33 | extrair segurança/navigation/resolver |
| #34 | não usar como base |
| #35 | extrair semântica/Trials/Subscriptions/Settings/Health |
| #36 | integrar Billing |
| #37 | documentação e gates de restauração |
| post-audit cronograma 02/10 | requisitos funcionais posteriores aceitos |

---

# 26. DEFINITION OF DONE

O FM Command funcional só estará completo quando:

- arquitetura Target estiver preservada;
- cockpit por produto existir;
- módulos essenciais existirem;
- providers/fontes obrigatórios estiverem conectados ou formalmente bloqueados;
- semânticas obrigatórias estiverem aprovadas;
- Billing/Receivables estiverem governados;
- operations health estiver real;
- Activity Feed existir;
- Search existir;
- Notifications existirem;
- Core estiver contextualizado;
- tenant/RBAC estiverem coerentes em backend e UI;
- testes completos verdes;
- nenhuma integração fictícia;
- exact-SHA homologado;
- produção continuar separada até autorização.

---

# 27. ORDEM EXECUTIVA FINAL

```text
PRESERVAR O NÚCLEO
→ RECONCILIAR SEGURANÇA
→ COMPLETAR MÓDULOS
→ COMPLETAR PRODUCT COCKPIT
→ INTEGRAR BILLING/RECEIVABLES
→ COMPLETAR HEALTH/ACTIVITY/SEARCH/NOTIFICATIONS
→ RESOLVER SEMÂNTICAS/PROVIDERS
→ REVALIDAR RUNTIMES
→ CERTIFICAR FUNCIONAL
→ VISUAL PREMIUM
→ RECERTIFICAR
→ AUDIT & FIX
→ EXACT-SHA READINESS
→ F22
```

Este cronograma substitui qualquer estratégia de “consertar o Preview #34” como caminho principal.
