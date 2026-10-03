# FM COMMAND — BASELINE ARQUITETURAL, PARIDADE FUNCIONAL E RESTAURAÇÃO

**Data:** 03/10/2026  
**Produto comercial:** FM Command  
**Identificador técnico/histórico:** FM Control Center / FMCC  
**Repositório:** `faabio3131/FM-CONTROL-CENTER`  
**Status:** BASELINE CANÔNICA DE RESTAURAÇÃO — DOCUMENTAÇÃO / NÃO AUTORIZA ALTERAÇÃO FUNCIONAL OU PRODUÇÃO  
**Objetivo:** impedir perda de arquitetura, capacidades, rotas, contratos, segurança e funcionalidades durante a restauração do FM Command.

---

## 1. DECISÃO DE IDENTIDADE

**FM Command e FM Control Center são o mesmo produto.**

A nomenclatura correta é:

- **FM Command** — nome comercial oficial e nome apresentado ao usuário;
- **FM Control Center / FMCC** — nome técnico/histórico preservado;
- **FM-CONTROL-CENTER** — repositório atual;
- **fmcommand.com.br** — domínio comercial oficial definido;
- **Nova FM Tecnologia** — Tenant Zero e primeira organização usuária.

A mudança de nome não autoriza reconstrução, substituição de arquitetura,
duplicação de aplicação, perda de funções, rename destrutivo de contratos ou
criação de uma versão especial para a Nova FM.

Referência: ADR-014 e Documento 00 de Fundação e Governança.

---

## 2. REGRA DE AUTORIDADE

A restauração deverá obedecer à hierarquia:

1. Documento Mestre da Nova FM Tecnologia;
2. Padrões de Construção de Software Nova FM;
3. Documento 00 — Fundação e Governança do FM Control Center;
4. Target/System Design e ADRs vigentes;
5. contratos e schemas;
6. CURRENT comprovado no repositório;
7. testes e comportamento reproduzível;
8. evidências de Preview/Runtime;
9. documentação histórica como evidência de requisito e rastreabilidade.

Quando documentação e CURRENT divergirem, a divergência deve ser registrada.
Não é permitido escolher silenciosamente um lado.

---

## 3. MISSÃO ORIGINAL QUE NÃO PODE SER PERDIDA

O produto foi fundado como **SaaS comercial independente, Web First,
Cloud First e multi-tenant**, com a Nova FM como Tenant Zero.

A missão original é atuar como **plataforma central de inteligência, gestão,
monitoramento e comando empresarial**, transformando dados fragmentados em
contexto operacional compreensível e acionável.

As três dimensões estruturais permanecem:

### VISIBILIDADE
Dados, indicadores, estados, históricos, saúde, clientes, produtos, receita,
custos, trials, assinaturas, integrações, suporte, incidentes e alertas.

### INTELIGÊNCIA
FMCC Cognitive Vertical Core próprio do produto, usando fatos governados,
proveniência, correlação, explicação, análise e recomendações.

### AÇÃO GOVERNADA
Capacidades e comandos executados somente por serviços determinísticos
autorizados, com RBAC, step-up, idempotência e auditoria quando aplicável.

Nenhuma evolução visual pode reduzir o produto a um dashboard decorativo.

---

## 4. TARGET ARQUITETURAL ORIGINAL PRESERVADO

O Target vigente do FM Command contém:

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

O Core é próprio do FM Command.  
O Metric Engine é autoridade determinística de métricas.  
O frontend não é autoridade.  
O Core não é fonte de verdade universal.  
Missing permanece `unknown/unavailable`, nunca zero inventado.  
Tenant e product scope são server-side.

---

## 5. BASELINE TÉCNICA CONGELADA EM 03/10/2026

### main preservada

```text
main = f7535423d38751bbc38f6d7e5e6013a485bfcf0e
```

A `main` não contém o Preview visual atualmente exibido no Render.

### Preview atualmente observado

```text
Render service = fmcc-preview-web
Render service id = srv-danhfirtqb8s73bug4ag
branch do deploy visual = visual/command-approved-dashboard-20261002
SHA live = ba82e70ccda0d106af22fafdffac3e4f986443ac
deploy = dep-db012367bikc73fp4je0
status = live
```

Esse SHA pertence à PR #34 Draft e **não está mergeado na main**.

### PRs abertas relevantes

| PR | Branch | Base | Estado | Função |
|---|---|---|---|---|
| #32 | `feat/command-premium-dashboard-20261001` | main | OPEN/DRAFT | primeira linha Visual Premium |
| #33 | `fix/fm-command-completion-20261001` | main | OPEN/DRAFT | correções/gaps + visual |
| #34 | `visual/command-approved-dashboard-20261002` | PR #33 branch | OPEN/DRAFT | Preview visual atualmente live |
| #35 | `feat/fm-command-post-audit-20261002` | main | OPEN/DRAFT | cronograma pós-auditoria; inclui evolução sobre a linha visual |
| #36 | `feat/command-product-billing-control` | main | OPEN | Billing/recebimentos configuráveis por produto |

### HEADs conhecidos

```text
PR #32 = 5e454188711661d18981f6e7d9f930ed6d71616a
PR #33 = 883220a41d29f63054e8dd6d14a9234b17f27d40
PR #34 = ba82e70ccda0d106af22fafdffac3e4f986443ac
PR #35 = 1105276a891cd868f8c42dab3d742ffb31931b48
PR #36 = f1b68fdbf7e651839d4338cf36c9fbdc1e7169a6
```

**Conclusão:** o estado atual está fragmentado em múltiplas branches. Nenhuma
restauração deverá ocorrer por merge cego dessas PRs.

---

## 6. CAPACIDADES HISTORICAMENTE IMPLEMENTADAS/CERTIFICADAS

As fases F10–F20 registram implementação real, testes e gates para as seguintes
famílias de capacidade.

### F10 — Executive Command Center
- dashboard executivo server-side;
- métricas governadas;
- estados de indisponibilidade;
- provenance/freshness/quality;
- Core integrado;
- tenant autenticado;
- audit trail.

### F11 — Product Intelligence
- Product Registry canônico;
- product scope em source/fact/metric;
- Product Overview por SaaS;
- comparação de portfólio;
- Core single-product/multi-product;
- isolamento cross-product e cross-tenant;
- aquisição, ativação, engajamento, receita, churn, saúde e crescimento como
  categorias da visão individual do produto.

### F12 — Financeiro
- Financial Intelligence;
- receita/recebimento/custos quando governados;
- resultado operacional somente quando semanticamente suportado;
- unit economics fail-closed quando não há base factual suficiente.

### F13 — Growth / Comercial
- leads e trials governados;
- aquisição;
- funil/atribuição somente quando semanticamente sustentados;
- CAC e conversão não inventados.

### F14 — Operações / SRE / Incidentes
- sinais operacionais;
- incidentes;
- falhas de jobs e integrações;
- service errors;
- health/readiness pontuais;
- disponibilidade histórica somente quando existir série governada.

### F15 — Clientes / Uso / Suporte
- DAU;
- eventos de engajamento;
- chamados de suporte;
- agregados governados;
- PII não replicada desnecessariamente;
- score de risco/adoção somente quando houver semântica aprovada.

### F16 — Inteligência Executiva
- Evidence Packs;
- análise multi-domínio;
- variações determinísticas;
- correlação sem afirmar causalidade;
- anomalia/risco/forecast fail-closed;
- Core com separação entre fato, inferência e recomendação.

### F17 — Alertas e Automações Governadas
- regras determinísticas;
- alert occurrence;
- idempotência;
- RBAC;
- Audit Ledger;
- action preview/intents;
- nenhuma ação crítica externa automática.

### F18/F19/F20
- camada visual anterior;
- responsividade e acessibilidade como gates;
- regressão integral;
- browser E2E;
- secret scan;
- build/Docker;
- correções de segurança e supply chain;
- zero HIGH/CRITICAL após Fix F20.

Essas capacidades **não podem desaparecer por causa de redesign**.

---

## 7. CURRENT DA MAIN — ROTAS WEB EXISTENTES

Na `main@f753542...` existem superfícies reais:

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

Também existem APIs para:

- Core;
- produtos;
- Product Overview;
- comparação entre produtos;
- métricas;
- finance;
- growth;
- operations;
- customers;
- alerts;
- Kordena commercial;
- sources/health/sync;
- automações governadas.

Portanto, o CURRENT funcional da main **não é somente um dashboard simples**.

---

## 8. PARIDADE — ARQUITETURA ORIGINAL X CURRENT X BRANCHES

Legenda:

- **PASS** — existe no CURRENT comprovado;
- **PARCIAL** — existe, mas não atinge o Target completo;
- **BRANCH** — existe somente em branch/PR ainda não integrada;
- **AUSENTE** — não existe como capacidade equivalente;
- **EXTERNO** — depende de fonte/provider/configuração;
- **DEGRADADO** — existia/foi especificado, mas a experiência atual perdeu qualidade/paridade.

| Capacidade | Target original | main | PR/Preview recente | Classificação |
|---|---|---|---|---|
| SaaS multi-tenant comercial | obrigatório | implementado | preservado | PASS |
| Tenant Zero sem versão especial | obrigatório | arquitetura suporta | não deve ser hardcoded | PASS estrutural |
| Product Registry | obrigatório F11 | existe | aparece no Preview | PASS |
| Lista de produtos | obrigatório | existe | existe | PASS |
| Cockpit individual por produto | aquisição, ativação, engajamento, receita, churn, saúde, crescimento | página existe, mas majoritariamente cards genéricos de métricas + growth | card Home simplificado | **PARCIAL CRÍTICO** |
| Comparação entre produtos | obrigatório F11 | existe | não é destaque na UI visual | PASS funcional / DEGRADADO UX |
| Financeiro | F12 | rota existe | navegação existe | PASS funcional / dados dependem de fontes |
| Growth/Comercial | F13 | rota existe | navegação existe | PASS funcional / dados dependem de fontes |
| Clientes/Uso/Suporte | F15 | rota existe | navegação existe | PASS funcional / dados dependem de fontes |
| Operações/SRE | F14 | rota existe | visual consolidado é incompleto | PARCIAL |
| Inteligência Executiva/Core | estrutural | existe | forte presença visual | PASS funcional |
| Alertas/Automações | F17 | existe | visual resume ocorrências | PASS funcional |
| Fontes/Integrações | estrutural | existe | existe | PASS |
| Kordena Comercial | control plane | existe | source aparece configurada no Preview | PASS estrutural / runtime variável |
| Trials dedicados | requerido pós-auditoria | não há módulo dedicado na main | PR #35 adiciona | BRANCH |
| Assinaturas dedicadas | requerido pós-auditoria | não há módulo dedicado na main | PR #35 adiciona | BRANCH |
| Configurações dedicadas | requerido pós-auditoria | não há módulo dedicado na main | PR #35 adiciona | BRANCH |
| Saúde Operacional consolidada | SaaS/APIs/infra | main tem F14 e health pontual | PR #35 amplia autoridade; Preview ainda mostra muitos unavailable | PARCIAL |
| Activity Feed empresarial | histórico multi-domínio | não existe como event stream empresarial completo | Preview deriva principalmente de alertas | PARCIAL |
| Busca global | prevista no UX premium | não existe funcionalmente | elemento visual foi proposto/presente | AUSENTE |
| Central de notificações | prevista no UX premium | não existe funcionalmente | elemento visual foi proposto/presente | AUSENTE |
| Billing SaaS por produto | control plane FM | não existe na main | PR #36 implementa primeira superfície | BRANCH |
| Gateway/provider configurável | obrigatório por padrão Nova FM | não existe na main como UI Command | PR #36: provider-driven, Vault, PF/PJ | BRANCH |
| Receivables/faturas por cliente/produto | necessário para inadimplência real | não materializado no Command | arquitetura nova definida; implementação futura | AUSENTE/TARGET |
| Responsividade premium | requisito F18 e prompt visual | main anterior possuía responsividade básica | Preview #34 quebra em mobile real | **DEGRADADO CRÍTICO** |
| Visual Premium fiel | requisito aprovado | main não é target visual final | Preview #34 não atinge padrão e quebra composição | **DEGRADADO CRÍTICO** |
| RBAC/tenant isolation | obrigatório | existe | não pode ser alterado por visual | PASS estrutural |
| Audit/Provenance | obrigatório | existe | deve permanecer | PASS |
| Produção/F22 | depende readiness/autorização | não autorizada | não autorizada | EXTERNO/HUMANO |

---

## 9. GAP CENTRAL — PRODUCT COCKPIT

O maior gap de produto encontrado é a **visão individual de cada SaaS**.

A especificação F11 não pedia apenas um card no dashboard. Ela estabelecia uma
superfície por produto capaz de representar:

- identidade e status;
- aquisição;
- ativação;
- engajamento;
- receita;
- churn;
- saúde;
- crescimento;
- provenance;
- freshness;
- quality;
- período;
- gaps.

A página atual `/dashboard/products/[productId]` existe e preserva parte desse
contrato, porém sua UX atual é essencialmente uma grade de métricas e uma seção
de crescimento.

Para o FM Command cumprir sua missão executiva, a restauração deverá evoluir a
página de produto para um **cockpit contextual**, sem criar segunda autoridade:

```text
Produto
├── Visão Geral
├── Clientes
├── Trials
├── Assinaturas
├── Receita / MRR / ARR
├── Recebimentos / Inadimplência
├── Saúde Operacional
├── Incidentes
├── Uso / Engajamento
├── Suporte
├── Integrações
├── Alertas
├── Billing & Recebimentos
└── Core contextual do produto
```

Cada bloco só pode mostrar dado real/governado ou estado explícito de ausência.

---

## 10. O QUE A PR VISUAL DEVERIA TER FEITO

A especificação Visual Premium determinava explicitamente:

- preservar toda funcionalidade existente;
- não alterar arquitetura;
- não alterar autenticação, RBAC ou tenancy;
- não alterar regras de negócio;
- não alterar APIs/contratos;
- não alterar Core;
- não alterar modelo de dados;
- não alterar semântica de métricas;
- preservar rotas e fluxos;
- cobrir responsividade;
- inventariar todas as telas;
- auditar todos os controles;
- não concluir com regressão ou problema crítico mobile.

Também determinava que **nenhum redesenho simplificado substituísse a identidade
aprovada**.

---

## 11. DIVERGÊNCIA OBSERVADA NO PREVIEW #34

A PR #34 não ficou restrita a CSS.

No acumulado da linha visual até o SHA live foram alterados, entre outros:

- `src/app/dashboard/page.tsx`;
- `src/app/dashboard/command-shell.tsx`;
- `src/app/dashboard/layout.tsx`;
- `src/app/dashboard/core-query-form.tsx`;
- `src/app/dashboard/commercial/kordena/page.tsx`;
- onboarding;
- source resolver;
- navigation;
- E2E;
- mais de duas mil linhas de `globals.css`.

O Preview mobile observado em 03/10/2026 apresenta:

- sobreposição de colunas;
- conteúdo invadindo outras áreas;
- cards parcialmente encobertos;
- navegação horizontal truncada;
- elementos fora da grade;
- densidade ilegível em trechos;
- quebra evidente da composição responsiva.

Logo:

```text
RESPONSIVIDADE DO PREVIEW #34 = FAIL OBSERVADO
VISUAL PREMIUM FINAL = NÃO CERTIFICADO
PR #34 = NÃO DEVE SER MERGEADA NO ESTADO ATUAL
```

---

## 12. ESTADO DA LINHA PÓS-AUDITORIA

O Cronograma Mestre Pós-Auditoria já reconheceu explicitamente os gaps:

- CME-01 — semântica dos KPIs/cards;
- CME-02 — Trials, Assinaturas e Configurações;
- CME-03 — Saúde Operacional real;
- CME-04 — Activity Feed empresarial;
- CME-05 — Busca global;
- CME-06 — Notificações;
- CME-07 — Header/usuário/navegação;
- CME-08 — semânticas executivas;
- CME-09 — providers corporativos;
- CME-10 — Kordena + scheduler;
- CME-11 — Visual Premium e responsividade;
- CME-12..14 — certificação, auditoria e homologação.

A PR #35 iniciou parte desse cronograma, adicionando ao menos:

- Trials;
- Assinaturas;
- Configurações;
- autoridade adicional de Saúde Operacional.

Porém ela descende da linha visual recente. Portanto, deve ser **reconciliada
cirurgicamente**, não mergeada como pacote indivisível.

---

## 13. BILLING/RECEBIMENTOS — EVOLUÇÃO NOVA A PRESERVAR

A PR #36 foi criada separadamente a partir da main e estabelece a primeira
superfície do Command para billing SaaS por produto.

Princípios que passam a integrar o Target de restauração:

- billing SaaS da FM é separado de pagamentos operacionais dos clientes;
- configuração é por produto;
- provider não é hardcoded;
- titular pode ser Pessoa Física ou Pessoa Jurídica;
- credenciais ficam no Vault;
- Command é control plane/read model;
- produto mantém sua autoridade transacional;
- recebimentos preservam identidade canônica de produto/cliente/assinatura;
- nenhuma credencial bancária real ou provider real está ativado nesta baseline.

A restauração do Command não poderá perder essa evolução.

---

## 14. REGRAS ANTI-REGRESSÃO OBRIGATÓRIAS

Estas regras passam a ser requisito de restauração.

### R-01 — Capability Manifest antes de redesign
Antes de alterar UI global, gerar inventário de:
- rotas;
- módulos;
- APIs;
- botões/ações;
- RBAC;
- tenant scope;
- estados;
- integrações;
- testes.

### R-02 — Proibição de remoção silenciosa
Nenhuma rota, módulo, ação ou capacidade pode ser removida/ocultada por
redesign sem:
1. finding documentado;
2. impacto;
3. decisão explícita;
4. teste atualizado;
5. autorização quando aplicável.

### R-03 — Visual não redefine domínio
PR visual não pode modificar `domain`, `application`, `infrastructure`,
migrations, APIs ou contracts, salvo correção funcional explicitamente separada
e documentada.

### R-04 — Product Cockpit é contrato
Todo produto ativo deve possuir uma entrada navegável e uma visão individual
coerente. A Home não substitui a página do produto.

### R-05 — Contextualização por produto
Financeiro, clientes, trials, assinaturas, saúde, billing e alertas devem poder
ser apresentados no contexto do produto quando a autoridade suportar o scope.

### R-06 — Provider/configuração externa
Tudo que depende de provider, credencial ou conta externa deve ser configurável,
provider-neutral e protegido por segredo/controle apropriado.

### R-07 — Mobile é gate
Nenhuma PR visual pode ser aprovada apenas por screenshot desktop.

Viewports mínimos de homologação:

```text
360 x 800
390 x 844
768 x 1024
1280 x 720
1440 x 900
```

Devem ser verificados:
- overflow;
- sobreposição;
- clipping;
- navegação;
- formulários;
- tabelas/cards;
- Core;
- menus;
- ações.

### R-08 — Exact-SHA
Preview, testes, screenshots e aprovação devem apontar para o mesmo SHA.

### R-09 — Não usar Preview como prova de main
Toda evidência deve declarar:
- branch;
- SHA;
- ambiente;
- data;
- status.

### R-10 — Dados reais ou indisponíveis
Nenhum mock visual, gráfico decorativo ou número conceitual pode se tornar dado
executivo real.

### R-11 — Restore por extração, não merge cego
PRs #32–#36 devem ser tratadas como fontes de alterações. A restauração deve
selecionar commits/capacidades compatíveis com a baseline, evitando transportar
regressões junto com funcionalidades boas.

### R-12 — Certificação funcional antes do polish final
A ordem correta é:

```text
paridade funcional
→ navegação
→ integração
→ estados
→ segurança
→ testes
→ responsividade estrutural
→ Visual Premium
→ QA visual
→ regressão integral
→ Preview exact-SHA
→ auditoria
```

---

## 15. TARGET DE RESTAURAÇÃO

A restauração deverá produzir uma única linha coerente do FM Command:

```text
FM COMMAND
│
├── Visão Geral Executiva
│   ├── KPIs reais/governados
│   ├── Saúde
│   ├── Alertas
│   ├── Atividade
│   └── Core
│
├── Produtos
│   ├── Kordena
│   ├── IRON
│   ├── CampaIA
│   └── futuros produtos
│
├── Cockpit por Produto
│   ├── clientes
│   ├── trials
│   ├── assinaturas
│   ├── financeiro
│   ├── billing/recebimentos
│   ├── saúde
│   ├── uso
│   ├── suporte
│   ├── integrações
│   ├── alertas
│   └── Core contextual
│
├── Financeiro Consolidado
├── Comercial / Growth
├── Clientes
├── Trials
├── Assinaturas
├── Operações
├── Incidentes / Alertas
├── Core Executivo
├── Fontes e Integrações
├── Configurações
└── Centro de Contas / Billing por Produto
```

O consolidado da FM deve derivar dos domínios/produtos, sem perder segregação.

---

## 16. CLASSIFICAÇÃO FINAL DA AUDITORIA DE PARIDADE

### Preservado
- arquitetura central;
- main funcional;
- multi-tenancy/RBAC;
- Product Registry;
- Metric Engine;
- Core;
- módulos F12–F17;
- fontes/integrações;
- Kordena commercial control;
- audit/provenance.

### Fragmentado
- linha visual;
- pós-auditoria;
- billing Command;
- novas telas Trials/Assinaturas/Configurações.

### Parcial
- cockpit individual de produto;
- saúde operacional consolidada;
- activity feed;
- dados reais de vários domínios por ausência de sources/providers.

### Ausente
- busca global funcional;
- notificações funcionais;
- Receivables Ledger/contas a receber completo do Command.

### Degradado
- responsividade do Preview visual #34;
- fidelidade Visual Premium;
- clareza de navegação e densidade em mobile;
- percepção de profundidade funcional por produto.

### Proibido declarar pronto
- Visual Premium final;
- restauração integral;
- Billing production ready;
- F22/produção.

---

## 17. GATE PARA INICIAR A RESTAURAÇÃO

A implementação de restauração só deve começar quando esta baseline for usada
como checklist de execução.

Primeiro passo técnico da restauração:

1. criar branch única a partir da `main@f753542...`;
2. inventariar alterações úteis das PRs #32–#36;
3. classificar cada alteração como:
   - preservar;
   - portar;
   - reimplementar;
   - descartar;
4. reconstruir primeiro a paridade funcional/navegacional;
5. certificar;
6. somente então executar Visual Premium final.

Nenhuma PR visual atual deverá ser mergeada integralmente como atalho.

---

## 18. REGRA FINAL

**O FM Command não será restaurado para “parecer bonito”.**

Ele será restaurado para voltar a representar corretamente a arquitetura e as
capacidades do produto que foi projetado e certificado, incorporando as
evoluções válidas posteriores sem transportar regressões.

Qualquer executor futuro deverá provar, antes de declarar conclusão:

```text
ARQUITETURA PRESERVADA
+ CAPACIDADES PRESERVADAS
+ PRODUTOS CONTEXTUALIZADOS
+ SEGURANÇA PRESERVADA
+ DADOS GOVERNADOS
+ ROTAS FUNCIONAIS
+ MOBILE/RESPONSIVIDADE PASS
+ VISUAL PREMIUM PASS
+ REGRESSÃO INTEGRAL PASS
+ PREVIEW EXACT-SHA PASS
```

Se qualquer item falhar, a restauração permanece incompleta.
