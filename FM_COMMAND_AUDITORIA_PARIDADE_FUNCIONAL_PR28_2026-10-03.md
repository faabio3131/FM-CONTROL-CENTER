# FM COMMAND — AUDITORIA DE PARIDADE FUNCIONAL DA PR #28

**Data:** 03/10/2026  
**Produto:** FM Command  
**Identificador técnico/histórico:** FM Control Center / FMCC  
**Repositório:** `faabio3131/FM-CONTROL-CENTER`  
**Baseline auditada:** PR #28 mergeada  
**Merge SHA:** `b4a1b9cf163f5a0ecea0a5f703ff3aaba1c0c27a`  
**Head certificado da PR:** `488a47f5884d3be807449cf10efa8a9a84efbf7a`  
**Versão package:** `0.1.0`  
**System Design:** FMCC-04 v0.2  
**Objetivo:** confrontar o CURRENT da PR #28 com a arquitetura, documentação mestre, fases F00–F21 e requisitos posteriores aceitos, separando claramente o que estava construído, implantado, parcialmente disponível, bloqueado externamente e ainda inexistente.

---

# 1. AUTORIDADES UTILIZADAS

A auditoria segue a hierarquia institucional:

1. Documento Mestre da Nova FM Tecnologia;
2. Padrões de Construção Nova FM;
3. FMCC-00 Fundação e Governança;
4. FMCC-04 Target + System Design v0.2;
5. ADRs vigentes;
6. documentação F06–F21;
7. código real do snapshot PR #28;
8. testes/workflows;
9. evidência de Render Preview;
10. cronograma pós-auditoria de 02/10 como evolução posterior de requisito.

A auditoria não usa o Preview visual atual como fonte de verdade funcional.

---

# 2. REGRA DE CLASSIFICAÇÃO

Cada capacidade é classificada como:

- **IMPLEMENTADA** — código/contrato/serviço real existe;
- **IMPLANTADA PREVIEW** — esteve efetivamente publicada em Preview;
- **CERTIFICADA** — possui evidência de teste/gate correspondente;
- **PARCIAL** — parte do Target existe, mas não cobre a experiência/capacidade completa;
- **EXTERNAL_BLOCKER** — implementação interna existe, mas depende de credencial, provider, fonte, decisão ou runtime externo;
- **SEMANTICS_PENDING** — o dado/fórmula não pode ser promovido sem contrato semântico aprovado;
- **A CONSTRUIR** — capacidade necessária não existe no snapshot;
- **A PORTAR** — capacidade foi construída posteriormente em branch limpa ou aproveitável e não deve ser refeita do zero;
- **A REIMPLEMENTAR** — solução posterior existe, mas está presa a branch/regressão que não deve ser mergeada integralmente;
- **F22/HUMANO** — produção depende de autorização humana e certificação final.

---

# 3. IDENTIDADE DO CHECKPOINT PR #28

## 3.1 PR

```text
PR #28
fix(command): corrigir responsividade mobile validada em dispositivo real
base do PR: 2554ca373cf87bda223f9c5b323b675bc9cca7d6
head: 488a47f5884d3be807449cf10efa8a9a84efbf7a
merge: b4a1b9cf163f5a0ecea0a5f703ff3aaba1c0c27a
merge UTC: 2026-10-01T03:04:30Z
merge Brasil: 01/10/2026 00:04:30 -03
```

## 3.2 CI da PR

No HEAD `488a47...`:

- FMCC Foundation Gate — SUCCESS;
- FMCC F21 Operational Readiness Gate — SUCCESS.

## 3.3 Preview Render

O merge SHA `b4a1b9cf...` foi publicado com sucesso:

```text
service: fmcc-preview-web
deploy: dep-dausri60tbcc73ciqmag
source SHA: b4a1b9cf163f5a0ecea0a5f703ff3aaba1c0c27a
status histórico: deactivated
resultado original: deploy concluído com sucesso
```

Foi posteriormente substituído por versões novas. O estado `deactivated` significa histórico substituído, não falha daquele deploy.

---

# 4. PRESERVAÇÃO ARQUITETURAL

Comparado ao último baseline funcional imediatamente pré-visual:

```text
847ed0167086a041fa4446fde2d64e4b29c690f3
→
b4a1b9cf163f5a0ecea0a5f703ff3aaba1c0c27a
```

não houve alteração em:

```text
src/domain/**
src/application/**
src/infrastructure/**
```

Portanto o checkpoint PR #28 preserva o núcleo funcional pré-visual.

### Inventário do snapshot

```text
Domain TS             18
Application TS        25
Infrastructure TS     17
Dashboard pages       11
API routes            27
Test files            53
GitHub workflows       5
```

---

# 5. CONFORMIDADE COM A FUNDAÇÃO

A Fundação determina:

- SaaS comercial independente;
- Nova FM como Tenant Zero;
- Web First;
- Cloud First;
- multi-tenancy;
- Core próprio do produto;
- Core não substitui autoridades determinísticas;
- capacidades universais separadas de tenants/providers;
- mesma aplicação para Nova FM e clientes;
- nenhuma capacidade declarada pronta sem evidência.

## Estado na PR #28

| Requisito | Estado |
|---|---|
| SaaS independente | IMPLEMENTADO estruturalmente |
| Web First | IMPLEMENTADO |
| Cloud First | IMPLEMENTADO / Preview Render |
| Multi-tenant | IMPLEMENTADO + testado |
| TenantContext server-side | IMPLEMENTADO |
| RBAC | IMPLEMENTADO backend; navegação ainda precisa reconciliação posterior |
| Core próprio | IMPLEMENTADO |
| Autoridades determinísticas | PRESERVADAS |
| Audit/provenance | IMPLEMENTADO |
| Fail-closed | IMPLEMENTADO |
| Missing != zero | IMPLEMENTADO |
| Tenant Zero sem fork | PRESERVADO |
| Produção comercial | NÃO EXECUTADA / F22 |

**Conclusão:** fundação arquitetural fortemente preservada.

---

# 6. TARGET / SYSTEM DESIGN v0.2

O Target define as seguintes camadas:

1. Product Shell / Experience;
2. Identity & Tenant Control Plane;
3. Application / Domain;
4. Source & Connector Control Plane;
5. Ingestion / Sync Fabric;
6. Canonical Data / Read Models;
7. Metric Registry + Metric Engine;
8. Query & Provenance Services;
9. FMCC Cognitive Vertical Core;
10. Governed Action Orchestrator;
11. Audit / Observability;
12. Runtime / Platform.

## Paridade

| Camada | PR #28 | Observação |
|---|---|---|
| Product Shell | IMPLEMENTADO | UI existe, profundidade por produto ainda parcial |
| Identity/Tenant | IMPLEMENTADO | Better Auth + membership + server-side context |
| Domain/Application | IMPLEMENTADO | 43 arquivos entre domain/application |
| Source/Connector | IMPLEMENTADO | Registry, health, sync, Kordena connector |
| Ingestion/Sync | IMPLEMENTADO | canonical facts + sync executions |
| Canonical Data | IMPLEMENTADO | facts + metric values |
| Metric Registry/Engine | IMPLEMENTADO | determinístico e versionado |
| Query/Provenance | IMPLEMENTADO | freshness/quality/source/provenance |
| Vertical Core | IMPLEMENTADO | provider boundary + audit + grounding |
| Governed Actions | IMPLEMENTADO PARCIAL | alerts previews + Kordena commands; sem ação crítica autônoma |
| Audit/Observability | IMPLEMENTADO PARCIAL | audit forte; service health consolidado ainda não |
| Runtime/Platform | IMPLEMENTADO PREVIEW | produção não autorizada |

---

# 7. F07 — INTEGRATION FABRIC

## Target

- Source Registry tenant-scoped;
- connector contracts;
- canonical facts;
- provenance;
- secret-by-reference;
- server-side RBAC;
- health/sync;
- fail-closed.

## PR #28

**IMPLEMENTADO.**

Código real:

- `SourceRegistryService`;
- `ConnectorRuntime`;
- `PostgresSourceRepository`;
- `PostgresSyncRepository`;
- `PostgresCanonicalFactRepository`;
- APIs de source;
- health;
- sync;
- Kordena connector.

### Gap

Integração Fabric existe; **cobertura de providers reais não existe para todos os domínios**.

Não reconstruir a malha. Conectar providers/fontes.

---

# 8. F08 — DATA PLATFORM + METRIC ENGINE

## PR #28

**IMPLEMENTADO.**

Inclui:

- Metric Registry;
- Metric Engine determinístico;
- MetricValue;
- MetricService;
- PostgreSQL Metric Store;
- provenance;
- freshness;
- quality;
- tenant/product scope.

### Catálogo executivo

Total:

```text
24 alvos executivos
16 definitionStatus = implemented
8 definitionStatus = pending_semantics
```

### Oito semânticas pendentes

1. `trial.active.count`;
2. `trial.conversion.rate`;
3. `subscription.logo_churn.rate`;
4. `revenue.mrr`;
5. `revenue.arr`;
6. `finance.operating_result` como alvo executivo;
7. `finance.operating_margin.rate`;
8. `service.error.rate`.

**Conclusão:** motor pronto; catálogo semanticamente incompleto.

---

# 9. COBERTURA REAL DAS 24 MÉTRICAS

A documentação de source coverage no próprio snapshot classifica:

```text
READY_TO_CONNECT             3
SEMANTICS_PENDING            8
PROVIDER_UNDECIDED          10
ARCHITECTURAL_RECONCILIATION 1
READY_FOR_INTERNAL_ADAPTER   2
```

## READY_TO_CONNECT

- trial starts;
- subscription cancelled;
- cash collected.

## SEMANTICS_PENDING

- trial active;
- trial conversion;
- subscription active as-of;
- churn;
- MRR;
- ARR;
- operating margin;
- service error rate.

## PROVIDER_UNDECIDED

- billing invoices;
- inadimplência monetária;
- FinOps infraestrutura;
- custos operacionais;
- CRM/leads;
- incident authority;
- service errors;
- DAU;
- engagement;
- support.

## READY_FOR_INTERNAL_ADAPTER

- job failures;
- integration failures.

## Reconciliação arquitetural

- operating result no registry executivo.

### Conclusão

**A PR #28 tinha o motor para responder, mas não tinha fontes reais suficientes para preencher o Command inteiro.**

Não é falha do Metric Engine.
É lacuna de source/provider/semântica.

---

# 10. F09 — COGNITIVE CORE

## Estado

**IMPLEMENTADO E CERTIFICADO.**

Inclui:

- `FmccVerticalCognitiveCore`;
- Core Gateway;
- provider cognitivo atrás de boundary;
- grounding via Metric Engine;
- tenant/user operational memory via Audit Ledger;
- provenance/evidence;
- fail-closed;
- product-aware;
- Kordena governed read capability.

### Não refazer

O Core não deve ser reconstruído.

### Completar

Adicionar novas capabilities somente quando novas fontes/read models forem materializados.

---

# 11. F10 — EXECUTIVE COMMAND CENTER

## Estado

**IMPLEMENTADO.**

- dashboard server-side;
- cards executivos;
- provenance/freshness/quality;
- Core query;
- tenant server-side;
- safe degradation.

### Gap funcional atual já perceptível no checkpoint

O dashboard é uma superfície executiva global, porém não substitui módulos operacionais profundos.

**Manter o Executive Command Center; não tratá-lo como aplicação inteira.**

---

# 12. F11 — PRODUCT INTELLIGENCE

## Estado

**IMPLEMENTADO estruturalmente.**

Existe:

- Product Registry;
- tenant scope;
- product scope em source/fact/metric;
- Product Overview;
- Portfolio Comparison;
- Product Intelligence Service;
- APIs;
- página individual;
- Core product-aware;
- cross-product isolation.

## Gap

A página individual `/dashboard/products/[productId]` é funcional, mas ainda rasa.

No snapshot ela mostra principalmente:

- métricas por produto;
- categoria;
- provenance;
- growth/tendência.

Ela não consolida em um único cockpit:

- clientes;
- trials;
- assinaturas;
- financeiro;
- receivables;
- saúde;
- uso;
- suporte;
- integrações;
- alertas;
- billing;
- Core contextual.

### Estado

```text
Product Intelligence backend = IMPLEMENTADO
Product Overview = IMPLEMENTADO
Cockpit executivo profundo por produto = A CONSTRUIR/EVOLUIR
```

---

# 13. F12 — FINANCEIRO / UNIT ECONOMICS

## Estado interno

**IMPLEMENTADO PARCIAL.**

Existe:

- `FinancialIntelligenceService`;
- `/api/intelligence/finance`;
- `/dashboard/finance`;
- operating result determinístico quando dados compatíveis existem;
- bloqueio de currency/period incompatíveis.

## O que não estava completo

- billing invoice source;
- monetary delinquency source;
- infraestrutura cost source;
- operating cost source;
- MRR/ARR semântica final;
- operating margin;
- CAC/LTV/payback/ARPU/margem com contratos completos;
- receivables ledger real.

### Classificação

```text
estrutura financeira = IMPLEMENTADA
autoridade financeira real = PARCIAL / PROVIDERS
unit economics completo = SEMANTICS/SOURCE BLOCKED
receivables = A CONSTRUIR
```

---

# 14. F13 — GROWTH / COMERCIAL

## Estado

**IMPLEMENTADO PARCIAL.**

Existe:

- `GrowthIntelligenceService`;
- API;
- UI;
- trial starts factual.

Faltava:

- CRM/leads provider;
- trial conversion canonical cohort;
- CAC;
- channel attribution;
- full funnel.

### Classificação

Motor/superfície pronta; provider e semântica incompletos.

---

# 15. F14 — OPERATIONS / SRE / INCIDENTS

## Estado

**IMPLEMENTADO PARCIAL.**

Existe:

- `OperationsIntelligenceService`;
- API;
- UI;
- `/api/health`;
- `/api/ready`;
- source health;
- sync states;
- job/integration/service error metric contracts.

## Gap arquitetural descoberto depois

A arquitetura original corretamente não transformava health instantâneo em uptime.

Porém o produto ainda não possuía:

- Service Health authority consolidada;
- visão real de saúde de FM Command + Kordena + IRON + CampaIA;
- SLO/SLA/histórico;
- incident registry/provider real;
- infraestrutura health unificada.

O cronograma pós-auditoria chamou isso de **CME-03**.

### Estado

```text
operations intelligence = IMPLEMENTADA
health/readiness pontual = IMPLEMENTADO
operational health consolidado = A CONSTRUIR
incident authority = PROVIDER/ADAPTER PENDENTE
```

---

# 16. F15 — CLIENTES / USO / SUPORTE

## Estado

**IMPLEMENTADO PARCIAL.**

Existe:

- `CustomerIntelligenceService`;
- API;
- UI;
- DAU/engagement/support metric contracts;
- privacy/fail-closed.

Faltava:

- telemetry provider;
- support provider;
- customer-level read model robusto;
- MAU;
- adoption;
- customer risk score;
- experience score;
- customer cockpit.

### Classificação

Superfície agregada existe; profundidade customer-level depende de fontes/semânticas.

---

# 17. F16 — ADVANCED EXECUTIVE CORE

**IMPLEMENTADO E CERTIFICADO.**

Existe:

- multi-domain Evidence Pack;
- variação determinística;
- correlação governada;
- provenance;
- anomaly/risk/forecast fail-closed;
- executive API/UI;
- audit.

Não refazer.

---

# 18. F17 — ALERTS / GOVERNED AUTOMATION

## Estado

**IMPLEMENTADO PARCIAL.**

Existe:

- AlertRule;
- evaluation;
- occurrences;
- acknowledgement;
- disable/archive;
- action previews;
- idempotency;
- audit;
- RBAC;
- UI;
- APIs;
- internal automation endpoint;
- GitHub Actions scheduler workflow.

## Pendente

O scheduler depende de:

- `FMCC_AUTOMATION_BASE_URL`;
- `FMCC_ALERT_AUTOMATION_SCHEDULER_SECRET`.

Sem runtime real, automação agendada não pode ser declarada ativa.

Também não havia uma Central de Notificações empresarial completa.

### Estado

```text
alert engine = IMPLEMENTADO
governed action preview = IMPLEMENTADO
scheduler code = IMPLEMENTADO
scheduler runtime = EXTERNAL_BLOCKER
notification center = A CONSTRUIR
```

---

# 19. F18 — UX/UI BASE

Na PR #28:

- primeira camada Visual Premium existia;
- correção responsiva mobile da PR #28 foi aplicada;
- dashboard de #28 tornou-se o mesmo preservado até #31.

A F18 original exigia:

- desktop/tablet/mobile;
- acessibilidade;
- feedback;
- estados;
- Preview.

**Não usar F18 como prova de completude funcional.**

O visual final fica propositalmente por último na restauração.

---

# 20. F19 — CERTIFICAÇÃO TÉCNICA

Histórico anterior ao checkpoint registrava:

- lint PASS;
- typecheck PASS;
- migrations PASS;
- build PASS;
- 39 test files / 135 tests;
- secret scan;
- runtime smoke;
- Docker;
- dependency audit HIGH threshold.

Depois F20/F21 ampliaram a matriz.

A PR #28 HEAD também teve Foundation e F21 gates verdes.

---

# 21. F20 — INDEPENDENT AUDIT & FIX

Antes da PR #28, F20 havia sido concluída.

Findings HIGH resolvidos:

- preview payload binding;
- action allowlist;
- approval replay;
- connector timeout;
- lockfile.

Findings MEDIUM principais resolvidos:

- sync idempotency por source;
- alert truncation;
- stale-run recovery;
- audit sanitization;
- security headers;
- action pinning;
- cross-tenant error handling.

Risco aceito:

- tooling transitive MODERATE não-runtime.

**Não refazer F20; reexecutar auditoria após restauração.**

---

# 22. F21 — OPERATIONAL READINESS

Historicamente certificado antes da PR #28.

Evidência registrada:

- Foundation Gate;
- Cognitive Gate;
- F21 Readiness Gate;
- backup/restore PostgreSQL isolado;
- security/tenant adversarial subset;
- secret scan;
- runtime audit;
- Preview exact-SHA histórico.

## Porém F21 carregava blockers externos honestamente

- Kordena runtime real;
- scheduler real;
- provider decisions;
- pending semantics;
- SLO/RPO/RTO/retention provider-specific.

Portanto:

**F21 = readiness técnico certificado com blockers externos, não produção comercial completa.**

---

# 23. F22 — PRODUÇÃO

Na PR #28:

**NÃO EXECUTADO / NÃO AUTORIZADO.**

Não existe base para declarar 100% comercial em produção.

---

# 24. ROTAS PRESENTES NA PR #28

```text
/dashboard
/dashboard/products/[productId]
/dashboard/finance
/dashboard/growth
/dashboard/customers
/dashboard/operations
/dashboard/intelligence
/dashboard/alerts
/dashboard/alerts/rules/[ruleId]
/dashboard/commercial/kordena
/dashboard/sources
```

## Ausentes

```text
/dashboard/trials
/dashboard/subscriptions
/dashboard/settings
/dashboard/products/[productId]/billing
```

Também não existem arquivos/rotas equivalentes para:

- global search;
- notifications center;
- unified activity feed.

---

# 25. CAPACIDADES QUE A PR #28 NÃO POSSUÍA

## Original/evolutivo obrigatório para conclusão

1. cockpit completo por produto;
2. modules Trials;
3. module Assinaturas;
4. Settings consolidado;
5. Operational Health consolidado;
6. Unified Activity Feed;
7. global search;
8. notifications center;
9. real user/role aware navigation completo;
10. 8 semantics pendentes;
11. corporate provider coverage;
12. real scheduler runtime;
13. receivables;
14. billing control por produto;
15. F22.

---

# 26. TRABALHO POSTERIOR JÁ DISPONÍVEL PARA RECONCILIAÇÃO

Nem tudo precisa ser construído novamente.

## PR #33

`883220a41d29f63054e8dd6d14a9234b17f27d40`

Gates:
- Foundation PASS;
- F21 PASS.

Tem trabalho funcional útil:

- role/permission-aware navigation;
- server-side dashboard role resolution;
- onboarding guard;
- CommercialSourceResolver;
- correção do acesso Kordena Commercial sem dependência acidental de `source:read`.

**Ação:** REIMPLEMENTAR/PORTAR cirurgicamente.  
Não mergear a linha visual inteira.

## PR #35

`1105276a891cd868f8c42dab3d742ffb31931b48`

Tem:

- semântica de cards;
- Trials;
- Assinaturas;
- Settings;
- Operational Health authority.

Gates:
- Cognitive PASS;
- F21 PASS;
- Foundation FAIL.

**Ação:** usar como fonte de código/conceito, não como candidate de merge.

## PR #36

`f1b68fdbf7e651839d4338cf36c9fbdc1e7169a6`

Billing e Recebimentos configuráveis por produto.

Gates:
- Foundation PASS;
- Cognitive PASS;
- F21 PASS.

**Ação:** PRESERVAR E INTEGRAR.

---

# 27. COMPARATIVO — O QUE DEVERIA TER × O QUE A PR #28 TEM × O QUE FALTA

| Capacidade | Target | PR #28 | Gap/Ação |
|---|---|---|---|
| Auth/session | obrigatório | SIM | preservar |
| Multi-tenant | obrigatório | SIM | preservar |
| RBAC backend | obrigatório | SIM | preservar |
| RBAC navigation | obrigatório | PARCIAL | portar correção #33 |
| Product Registry | F11 | SIM | preservar |
| Product scope | F11 | SIM | preservar |
| Product Overview | F11 | SIM | preservar |
| Product cockpit completo | evolução necessária | NÃO | construir |
| Source Registry | F07 | SIM | preservar |
| Connector Runtime | F07 | SIM | preservar |
| Canonical Facts | F07/F08 | SIM | preservar |
| Metric Registry | F08 | SIM | resolver 8 semânticas |
| Metric Engine | F08 | SIM | preservar |
| Provenance | obrigatório | SIM | preservar |
| Cognitive Core | F09/F16 | SIM | preservar |
| Executive dashboard | F10 | SIM | reconciliar cards |
| Finance | F12 | PARCIAL | providers + semântica |
| Growth | F13 | PARCIAL | CRM/coorte/CAC |
| Operations | F14 | PARCIAL | service health real |
| Customers | F15 | PARCIAL | telemetry/support/customer read model |
| Alerts | F17 | SIM | preservar |
| Scheduled automation | F17 | código sim/runtime não | configurar/revalidar |
| Trials module | pós-auditoria | NÃO | portar/evoluir #35 |
| Subscriptions module | pós-auditoria | NÃO | portar/evoluir #35 |
| Settings | pós-auditoria | NÃO | portar/evoluir #35 |
| Activity Feed | pós-auditoria | NÃO | construir |
| Global Search | pós-auditoria | NÃO | construir |
| Notifications | pós-auditoria | NÃO | construir |
| Operational Health | pós-auditoria | NÃO consolidado | portar/evoluir #35 |
| Kordena Control Plane | KCA/FMCC | SIM código | runtime revalidar |
| Product Billing Control | evolução | NÃO | integrar #36 |
| Receivables | evolução financeira | NÃO | construir |
| Backup/restore readiness | F21 | certificado histórico | recertificar final |
| Production | F22 | NÃO | human gate + release |

---

# 28. O QUE NÃO DEVE SER REFEITO

Preservar:

- domain/application/infrastructure da PR #28;
- Better Auth;
- tenant model;
- RBAC contracts;
- Integration Fabric;
- Product Registry;
- canonical facts;
- Metric Engine;
- Core;
- Product Intelligence;
- Financial Intelligence base;
- Growth Intelligence base;
- Operations Intelligence base;
- Customer Intelligence base;
- Alert Engine;
- Audit Ledger;
- Kordena connector/control;
- source registry;
- workflows/gates existentes.

---

# 29. O QUE PRECISA SER COMPLETADO

## Bloco interno sem depender de provider externo

- RBAC/navigation;
- onboarding guard;
- commercial resolver;
- cards semânticos;
- Trials UI/service projection;
- Subscriptions UI/service projection;
- Settings;
- Operational Health read model;
- Activity Projection;
- Search;
- Notifications;
- Product Cockpit;
- Billing #36 integration;
- receivables model/projection;
- test/CI reconciliation.

## Bloco dependente de autoridade humana/provider

- 8 semantic decisions;
- billing source/provider;
- receivables authority;
- FinOps source;
- operating cost source;
- CRM;
- incident authority;
- service errors;
- product usage telemetry;
- support provider;
- scheduler runtime;
- Kordena runtime exact environment validation;
- RPO/RTO/retention/SLO final;
- F22 production authorization.

---

# 30. VEREDITO

A PR #28 é um **checkpoint tecnicamente íntegro e adequado como baseline funcional de restauração**, mas não é produto comercial 100% completo.

Ela preserva praticamente toda a arquitetura F06–F21, incluindo o núcleo funcional difícil de reconstruir.

O trabalho restante é predominantemente:

1. completar superfícies e read models;
2. reconciliar segurança/navegação;
3. resolver semânticas;
4. conectar providers;
5. integrar evoluções posteriores válidas;
6. recertificar;
7. somente depois finalizar o visual;
8. F22 após autorização humana.

**Não reconstruir o FM Command do zero.**
**Não usar PR #34/#35 como base integral.**
**Restaurar a partir de uma linha limpa derivada do checkpoint preservado/main, portando seletivamente as capacidades posteriores.**
