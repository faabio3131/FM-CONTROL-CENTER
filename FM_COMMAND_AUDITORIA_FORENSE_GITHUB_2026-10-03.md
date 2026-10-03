# FM COMMAND — AUDITORIA FORENSE DO GITHUB

**Data:** 03/10/2026  
**Repositório:** `faabio3131/FM-CONTROL-CENTER`  
**Fonte de verdade:** GitHub remoto  
**Escopo:** histórico, main, branches, PRs abertas, gates, arquitetura preservada e plano de reconciliação  
**Natureza:** auditoria somente leitura consolidada em documentação  
**Produção:** não autorizada

---

# 1. CONCLUSÃO EXECUTIVA

O FM Command **não foi perdido**.

A arquitetura funcional e o núcleo de domínio permanecem preservados na
`main`. A regressão visual observada no Preview pertence à linha
`#32 → #33 → #34 → #35`, que permanece fora da `main`.

Entretanto, a `main` não é uma cópia intocada do estado pré-visual:
as PRs #27–#31 foram mergeadas e introduziram a primeira onda de Visual Premium.
A inspeção entre o último baseline funcional pré-visual e a main atual demonstra
que essa onda mergeada não alterou `src/domain`, `src/application` ou
`src/infrastructure`.

Portanto:

```text
NÚCLEO FUNCIONAL ORIGINAL = PRESERVADO
ARQUITETURA DE DOMÍNIO = PRESERVADA
APPLICATION SERVICES = PRESERVADOS
INFRAESTRUTURA FUNCIONAL = PRESERVADA
PRIMEIRA CAMADA VISUAL = MERGEADA
SEGUNDA LINHA VISUAL PROBLEMÁTICA = NÃO MERGEADA
NOVAS CAPACIDADES PÓS-AUDITORIA = FRAGMENTADAS EM PRs
RESTAURAÇÃO DO ZERO = NÃO NECESSÁRIA
RECONCILIAÇÃO SELETIVA = NECESSÁRIA
```

---

# 2. CURRENT OFICIAL

## main

```text
branch: main
SHA: f7535423d38751bbc38f6d7e5e6013a485bfcf0e
último merge: PR #31
mensagem: fix(command): corrigir responsividade da tela de login premium
data UTC: 2026-10-01T23:39:00Z
data Brasil (-03): 01/10/2026 20:39
```

O merge #31 alterou somente:

- `e2e/fmcc-critical.spec.ts`;
- `src/app/command-auth-premium.css`.

---

# 3. ÚLTIMO BASELINE FUNCIONAL PRÉ-VISUAL

O ponto imediatamente anterior ao início da primeira onda Visual Premium é:

```text
847ed0167086a041fa4446fde2d64e4b29c690f3
Merge PR #26
feat(kf03): bootstrap Kordena live runtime source
```

Comparação:

```text
847ed016... → f7535423...
44 commits
15 arquivos alterados
```

Arquivos alterados nesse intervalo:

- E2E;
- CSS de autenticação;
- Dashboard shell;
- Dashboard layout;
- Dashboard page — alteração mínima da primeira onda;
- Core query form — apresentação;
- globals.css;
- root layout — estilo/import;
- sign-in;
- assets/presentation;
- testes de Visual Premium.

**Nenhum arquivo em:**

- `src/domain/**`;
- `src/application/**`;
- `src/infrastructure/**`.

Isso comprova que o núcleo arquitetural pré-visual continua presente na main.

---

# 4. PRIMEIRA ONDA VISUAL — JÁ MERGEADA

## PR #27
`feat(command): Visual Premium aprovado em todo o FM Command`

Mudou:
- command shell;
- dashboard layout;
- dashboard page de forma pequena;
- Core form em apresentação;
- globals.css;
- E2E;
- testes premium.

Gates:
- Foundation: PASS;
- F21 Operational Readiness: PASS.

## PR #28
`fix(command): corrigir responsividade mobile validada em dispositivo real`

Mudou:
- dashboard page: 2 linhas;
- globals.css;
- teste premium.

Gates:
- Foundation: PASS;
- F21: PASS.

## PR #29
Visual premium da abertura/login.

Mudou:
- sign-in;
- CSS de autenticação;
- artwork/logo;
- E2E/testes.

Gates: PASS.

## PR #30
Correção da arte de login.

Gates: PASS.

## PR #31
Responsividade da tela de login.

Gates: PASS.

### Resultado

A primeira onda visual está na main e precisa ser avaliada visualmente durante a
restauração, mas **não substituiu o domínio nem a arquitetura funcional**.

---

# 5. CURRENT FUNCIONAL DA MAIN

Inventário comprovado:

```text
src/domain          18 arquivos TS
src/application     25 arquivos TS
src/infrastructure  17 arquivos TS
dashboard pages     11
API routes          27
tests               53
```

## Domínios preservados

- Alerts;
- Cognitive Core;
- Customer Intelligence;
- Executive Analysis;
- Finance;
- Growth;
- Integrations;
- Metrics;
- Operations;
- Organization;
- Products;
- Security/Tenant.

## Application Services preservados

- Alert Service / Automation;
- Audit;
- Core Composition/Gateway/Vertical Cognitive Core;
- Customer Intelligence;
- Executive Analysis;
- Financial Intelligence;
- Growth Intelligence;
- Connector Runtime;
- Kordena Commercial Control;
- Source Registry;
- Metric Service;
- Operations Intelligence;
- Product Intelligence;
- Product Registry;
- Password Step-up;
- Tenant Context.

## Infraestrutura preservada

- Alert repositories;
- Better Auth;
- Core context;
- cognitive model adapter;
- DB schema/migrations;
- Kordena connector;
- integration repositories;
- metric store;
- observability logger;
- product repository.

---

# 6. ROTAS WEB PRESERVADAS NA MAIN

```text
/dashboard
/dashboard/alerts
/dashboard/alerts/rules/[ruleId]
/dashboard/commercial/kordena
/dashboard/customers
/dashboard/finance
/dashboard/growth
/dashboard/intelligence
/dashboard/operations
/dashboard/products/[productId]
/dashboard/sources
```

Não existem ainda na main:

```text
/dashboard/trials
/dashboard/subscriptions
/dashboard/settings
/dashboard/products/[productId]/billing
```

Essas superfícies aparecem em PRs posteriores e precisam ser reconciliadas.

---

# 7. APIS PRESERVADAS

A main contém APIs reais para:

- alertas;
- alert actions;
- auth;
- Core;
- health;
- Kordena Commercial read/write;
- customer intelligence;
- executive intelligence;
- finance;
- growth;
- operations;
- automação interna;
- identidade da sessão;
- metrics;
- product overview;
- product comparison;
- products;
- readiness;
- source health;
- source sync;
- source registry;
- version.

Logo, o backend funcional não foi reduzido ao dashboard visual visto no Preview.

---

# 8. PRODUCT INTELLIGENCE PRESERVADO

A F11 documenta e implementa:

- Product Registry;
- Product Overview por SaaS;
- Portfolio Comparison;
- APIs por produto;
- UI de listagem;
- visão individual;
- comparação;
- Core com produto single/multi;
- isolamento cross-product/cross-tenant.

Na main atual:

```text
/dashboard/products/[productId]
```

continua existindo e utiliza `ProductIntelligenceService`.

### Gap atual

A página é funcional, porém é uma superfície relativamente simples de métricas
por categoria + crescimento. Não materializa ainda o cockpit executivo completo
que a evolução do produto passou a exigir.

Classificação:

```text
BACKEND PRODUCT INTELLIGENCE = PRESERVADO
PRODUCT OVERVIEW BÁSICO = PRESERVADO
COCKPIT PROFUNDO POR PRODUTO = PARCIAL / A EVOLUIR
```

---

# 9. GENEALOGIA DAS PRS ABERTAS

## #32 — visual
Branch:
`feat/command-premium-dashboard-20261001`

Base:
`main@f7535423...`

20 commits / 10 arquivos.

Principal impacto:
- 1.166 linhas adicionadas em globals.css;
- 469 mudanças em dashboard/page;
- composição visual.

Gates:
- Foundation PASS;
- F21 PASS.

**Não deve ser mergeada.**

---

## #33 — #32 + correções

Comparação #32 → #33:

```text
ahead: 5 commits
behind: 0
```

Logo, #33 **contém integralmente #32**.

Novidades relevantes:

### Commit bcc387f...
`fix(command): reconciliar RBAC web e onboarding`

Implementa:
- navegação filtrada por permission/role;
- DashboardLayout resolve tenant/role server-side;
- onboarding protegido server-side;
- CommercialSourceResolver;
- Kordena Commercial deixa de depender do Source Registry administrativo;
- testes RBAC/onboarding.

Esse trabalho é tecnicamente valioso.

### Commit 613175...
Reintroduz grande alteração visual:
- +1.166 linhas CSS;
- +469 mudanças no dashboard;
- orb visual;
- E2E visual.

Esse bloco não deve ser portado como unidade.

### Documentos
A #33 contém auditoria, matriz e certificação provisória úteis como evidência
histórica, mas o próprio documento final registra:

```text
FM COMMAND — NOT APPROVED
```

Motivos incluíam exact-SHA Preview, scheduler, runtime Kordena, semânticas e
providers externos.

**Classificação #33:**
- RBAC/onboarding/source resolver: PORTAR/REIMPLEMENTAR;
- visual: DESCARTAR;
- documentação: PRESERVAR COMO HISTÓRICO, RECONCILIAR STATUS.

---

# 10. PR #34 — PREVIEW VISUAL PROBLEMÁTICO

A #34 é baseada na branch da #33, não na main.

Comparação:

```text
#33 → #34
10 commits
ahead 10
behind 0
```

Logo, #34 contém #32 + #33 + nova onda visual.

Impacto acumulado versus main:

- globals.css: +2.378 linhas;
- dashboard/page: 518 mudanças;
- Core form;
- shell;
- growth;
- operations;
- product page;
- sources panel;
- onboarding;
- navigation;
- resolver;
- testes.

O HEAD:

```text
ba82e70ccda0d106af22fafdffac3e4f986443ac
```

não possui workflow runs vinculados no GitHub.

Esse é o SHA observado no Preview Render em 02/10.

A inspeção visual real no mobile demonstrou quebra de layout.

**Classificação: DESCARTAR COMO CANDIDATE DE MERGE.**

Pode ser usado apenas como fonte visual para identificar elementos aprovados,
nunca como base de restauração.

---

# 11. PR #35 — FUNCIONALIDADES BOAS SOBRE BASE RUIM

A #35 usa `main` como base declarada, mas o HEAD é descendente da #34.

Comparação:

```text
#34 → #35
ahead 4
behind 0
```

Logo, #35 carrega todo o histórico visual problemático.

Seus quatro commits exclusivos são:

### 5fbd914...
Semântica dos indicadores executivos.

Impacto:
- dashboard page;
- teste de command center.

**Ação:** revisar e portar somente correções semanticamente válidas.

### 3271bcb...
Trials, Assinaturas e Configurações.

Adiciona:
- `/dashboard/trials`;
- `/dashboard/subscriptions`;
- `/dashboard/settings`.

A inspeção dos arquivos mostra que Trials e Assinaturas são inicialmente
superfícies finas sobre o MetricService existente. Configurações é uma landing
de governança e links.

**Ação:** PORTAR/REIMPLEMENTAR em branch limpa; não transportar CSS/visual da
#35.

### 18041a6...
Autoridade governada de Saúde Operacional.

Adiciona:
- domain contract de health;
- OperationalHealthService;
- PostgresOperationalHealthRepository;
- tabelas/migration;
- Core capability;
- testes.

Esse é trabalho arquitetural real e útil.

**Ação:** PRESERVAR CONCEITO E PORTAR ISOLADAMENTE, recertificando migration,
schema e Core.

### 1105276...
Ajuste textual de Growth/Comercial.

**Ação:** avaliar como correção pequena durante reconciliação.

## Gate atual da #35

- Cognitive Gate: PASS;
- F21: PASS;
- Foundation: **FAIL**.

Falha em Browser E2E.

Duas causas objetivas encontradas:

1. seletor de `Saúde Operacional` ficou ambíguo porque a página passou a ter
   dois headings iguais;
2. o E2E procurava `Receita recorrente mensal (MRR)`, mas o card mudou de
   rótulo/semântica.

Portanto a #35 **não é um candidate verde**.

---

# 12. PR #36 — BILLING E RECEBIMENTOS

A #36 nasce limpa da main e é independente da #35.

Comparação #35 → #36:

```text
status: diverged
#36 ahead: 9
#36 behind da #35: 39
```

Arquivos:
- API local de billing;
- Product Billing page;
- Billing Control Panel;
- Billing Control Service;
- Kordena Billing Connector;
- extensão segura do Kordena Commercial Connector;
- integração test.

Gates:
- Foundation PASS;
- Cognitive Gate PASS;
- F21 PASS.

Impacto no Product Overview existente:
- apenas 7 linhas.

**Classificação: PRESERVAR.**

Recomendação de integração:
- manter a PR intacta como fonte funcional;
- reconciliar sua entrada no cockpit por produto da restauração;
- não misturar com a linha visual #32–#35.

---

# 13. PR #37 — BASELINE DOCUMENTAL

Somente documentação.

Gates:
- Foundation PASS;
- F21 PASS.

**Classificação: PRESERVAR E USAR COMO GATE DA RESTAURAÇÃO.**

---

# 14. PRINCIPAIS FINDINGS

## F-01 — O original funcional não foi apagado
**Severidade:** positiva/crítica para recuperação.

O núcleo continua na main.

## F-02 — A main recebeu Visual Premium inicial
**Severidade:** informativa.

Não é correto dizer que absolutamente nenhum visual entrou na main.

## F-03 — O Preview quebrado não está na main
**Severidade:** positiva.

A linha #32–#35 permanece isolada.

## F-04 — A cadeia #32–#35 é cumulativa
**Severidade:** alta.

Mergear #35 significaria carregar toda a regressão #32/#33/#34.

## F-05 — Há correções funcionais úteis presas nessa cadeia
**Severidade:** alta.

RBAC/onboarding/source resolver e Operational Health devem ser recuperados.

## F-06 — PR #35 não está certificada
**Severidade:** alta.

Foundation FAIL em Browser E2E.

## F-07 — PR #34 não possui run de workflow no HEAD
**Severidade:** alta.

O Preview foi publicado sem matriz CI exact-SHA no GitHub.

## F-08 — Product Cockpit ainda é raso
**Severidade:** média/alta.

A infraestrutura por produto existe, mas a UX precisa consolidar clientes,
trials, assinaturas, financeiro, health, billing, suporte, alertas e Core.

## F-09 — Search e Notifications continuam não funcionais
**Severidade:** média.

Elementos visuais podem existir em branches, mas não há backend funcional
equivalente na main.

## F-10 — Trials/Subscriptions/Settings não devem ser confundidos com módulos
completos
**Severidade:** média.

Na #35, as páginas são primeira superfície funcional. Trials e Subscriptions
ainda dependem das métricas e semânticas existentes; Settings ainda é uma
landing de governança, não um centro completo.

## F-11 — Billing #36 é linha limpa e verde
**Severidade:** positiva.

Deve ser incorporado na restauração.

---

# 15. MATRIZ DE DECISÃO

| Fonte | Decisão | Justificativa |
|---|---|---|
| main f7535423 | BASE DA RESTAURAÇÃO | núcleo funcional preservado |
| previsual 847ed016 | REFERÊNCIA FORENSE | permite distinguir funcional de visual |
| PR #27–31 | MANTER POR ENQUANTO | já mergeadas; apresentação/login; não alteraram domínio |
| PR #32 | DESCARTAR COMO BRANCH DE MERGE | visual amplo; supersedida |
| PR #33 docs | PRESERVAR HISTÓRICO | findings úteis |
| PR #33 RBAC/onboarding/resolver | REIMPLEMENTAR/PORTAR | correções reais |
| PR #33 visual | DESCARTAR | acoplado ao visual problemático |
| PR #34 | DESCARTAR COMO CANDIDATE | Preview quebrado + sem CI exact-SHA |
| PR #35 semântica | REVISAR/PORTAR | pode conter correções válidas |
| PR #35 Trials | PORTAR/EVOLUIR | primeira superfície, não módulo final |
| PR #35 Subscriptions | PORTAR/EVOLUIR | primeira superfície, não módulo final |
| PR #35 Settings | PORTAR/EVOLUIR | landing inicial |
| PR #35 Operational Health | PORTAR ISOLADAMENTE | arquitetura real e útil |
| PR #36 Billing | PRESERVAR/INTEGRAR | linha limpa, gates verdes |
| PR #37 baseline | PRESERVAR | autoridade documental da restauração |

---

# 16. O QUE NÃO PRECISA SER REFEITO

Não refazer do zero:

- autenticação;
- tenant isolation;
- Product Registry;
- Product Intelligence;
- Metric Registry/Engine;
- Finance Intelligence;
- Growth Intelligence;
- Customer Intelligence;
- Operations Intelligence;
- Alert Service;
- Governed Automation foundations;
- Core Vertical;
- Audit;
- Kordena Commercial Control;
- Source Registry;
- Connector Runtime;
- Product APIs;
- Product Comparison;
- banco base e schemas já presentes na main;
- Billing #36 como conceito/implementação.

---

# 17. O QUE PRECISA SER RECONCILIADO

1. navegação RBAC;
2. onboarding server guard;
3. Kordena commercial resolver sem privilégio administrativo de Source Registry;
4. Trials;
5. Assinaturas;
6. Configurações;
7. Operational Health;
8. semântica dos cards executivos;
9. Billing #36;
10. Product Cockpit;
11. navegação final;
12. documentação de estado.

---

# 18. O QUE PRECISA SER REFEITO

## Visual principal

A composição da #34 precisa ser refeita sobre uma branch limpa.

Não reutilizar como base:
- grid quebrado;
- CSS acumulado;
- posicionamento mobile;
- duplicação visual de saúde;
- elementos decorativos que simulam função.

É permitido reaproveitar:
- identidade visual aprovada;
- logo/orb aprovado quando tecnicamente adequado;
- tokens/cores/efeitos validados;
- referências visuais.

## Product Cockpit

A página individual precisa ser evoluída além da grade simples atual.

## Activity Feed

O Preview deriva atividade essencialmente de alert occurrences. Um Activity Feed
empresarial completo ainda precisa de autoridade/canonical events próprios.

## Busca Global

Refazer/construir funcionalmente; não há implementação real na main.

## Notificações

Construir funcionalmente; não há central real na main.

## Receivables

A arquitetura de Billing evoluiu, porém Accounts Receivable completo ainda será
trabalho próprio.

---

# 19. ORDEM DE RESTAURAÇÃO RECOMENDADA

```text
R0  congelar main + baseline
R1  portar RBAC/onboarding/resolver
R2  portar Operational Health
R3  portar/evoluir Trials, Subscriptions e Settings
R4  integrar Billing #36
R5  construir Product Cockpit completo
R6  reconciliar KPIs/semânticas
R7  construir Activity Feed real
R8  construir Search real
R9  construir Notifications real
R10 certificar funcionalidade
R11 refazer Visual Premium
R12 certificar mobile/tablet/desktop
R13 regression integral
R14 Preview exact-SHA
R15 auditoria final
```

---

# 20. VEREDITO

**Estado de preservação do FM Command: ALTO.**

Não há evidência no GitHub de perda do núcleo funcional ou de substituição do
domínio pelo visual.

O problema está concentrado em:

- fragmentação de evolução;
- PRs cumulativas;
- UX por produto ainda rasa;
- Visual Premium posterior mal executado;
- novas capacidades úteis presas em branches não mergeáveis como pacote;
- ausência de certificação final integrada.

A estratégia correta é **restaurar por reconciliação seletiva sobre a main**,
não reconstruir o FM Command do zero e não mergear #32–#35 integralmente.
