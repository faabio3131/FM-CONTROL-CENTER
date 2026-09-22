# FM CONTROL CENTER — RELATÓRIO DE EXECUÇÃO F11

**Fase:** F11 — Inteligência por Produto  
**Data de reconciliação:** 22/09/2026  
**Baseline:** `c199b5bc6fc4ad871523eeaf98f6705b12417bb7`  
**Branch:** `feat/fmcc-f11-product-intelligence`  
**PR:** #11 — OPEN/DRAFT  
**Candidate funcional certificado:** `e5a3d9bef3451b32830315f6e1b9175f9fc06dff`

## Resumo executivo

A F11 foi implementada tecnicamente e passou no Foundation Gate #162. A arquitetura introduz uma autoridade canônica de produto no FMCC sem deslocar as autoridades existentes de tenant, fontes, fatos, métricas ou auditoria.

O produto agora possui dimensão explícita em Source Definition, Canonical Fact e Metric Value; Product Intelligence para visão individual, growth governado e comparação; superfícies API/UI; e integração product-aware no FM Cognitive Vertical Core.

**Classificação atual:** IMPLEMENTADA E CERTIFICADA EM CI, MAS NÃO ENCERRADA.  
**Pendência:** Preview/smoke final da F11.

## Implementação entregue

### Product authority
- tabela `fmcc_product_definition`;
- slug único por tenant;
- status active/inactive;
- RBAC `product:read` / `product:write`;
- lookup sempre tenant-scoped.

### Product scope
- `product_id` opcional em Source Definition;
- `product_id` opcional em Canonical Fact;
- `product_id` opcional em Metric Value;
- propagação source → ingestion → fact → metric;
- consultas globais continuam isoladas de métricas product-scoped.

### Product Intelligence
- categorias acquisition, activation, engagement, revenue, churn e health;
- estado `pending_semantics` para métricas sem semântica aprovada;
- Product Overview por SaaS;
- histórico por produto;
- growth apenas com duas observações comparáveis;
- nenhum `product.performance.score` inventado.

### Portfolio Comparison
- mesma métrica;
- mesma unidade;
- mesma moeda quando aplicável;
- período comparável;
- estados explícitos `comparable`, `unavailable`, `pending_semantics`, `incompatible_currency` e `incompatible_period`.

### APIs e UI
- `GET/POST /api/products`;
- `GET /api/products/:productId/overview`;
- `GET /api/products/compare`;
- cadastro/listagem de produtos no dashboard;
- visão individual por produto;
- comparação governada no dashboard;
- gaps e provenance explícitos.

### Core F11
- planner recebe catálogo de produtos autorizado do tenant;
- plano pode retornar `productSlugs`;
- single-product e multi-product suportados;
- slug não autorizado falha fechado;
- facts/evidence carregam productId/productSlug;
- Audit Ledger registra product refs quando aplicável;
- Metric Engine permanece autoridade factual.

## Migration

Migration F11:
`drizzle/0002_foundation.sql`

Ela adiciona Product Registry, `product_id` opcional e índices de escopo sem invalidar dados globais F07–F10.

## Certificação automática

Foundation Gate #162 — SUCCESS no candidate funcional `e5a3d9b...`.

- 20 test files PASS;
- 84 tests PASS;
- 0 FAIL;
- lint SUCCESS;
- typecheck SUCCESS;
- migration verification SUCCESS;
- migration apply SUCCESS;
- build SUCCESS;
- Docker build SUCCESS;
- runtime dependency audit SUCCESS.

## Risco conhecido

O audit de dependências continua reportando 4 vulnerabilidades `moderate` transitivas em tooling de desenvolvimento. Não há HIGH/CRITICAL bloqueando o gate atual. Não foi aplicado downgrade/destructive force fix.

## Pendências reais

Antes de qualquer merge da PR #11:
- recertificar o HEAD documental resultante desta reconciliação;
- implantar a branch/candidate F11 no Preview de forma controlada;
- aplicar migration em Preview;
- executar smoke funcional e cognitivo;
- registrar evidências;
- classificar gate final;
- obter autorização humana explícita para merge.

## Governança

- PR #11 permanece OPEN/DRAFT;
- nenhum merge da F11 foi executado;
- nenhuma produção foi utilizada;
- F12 permanece proibida;
- documentação não converte CI em evidência operacional de Preview.
