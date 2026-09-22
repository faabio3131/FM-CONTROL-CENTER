# FM CONTROL CENTER — F11 MISSION LEDGER

**Mission:** F11 — Inteligência por Produto  
**Baseline main:** `c199b5bc6fc4ad871523eeaf98f6705b12417bb7`  
**Branch:** `feat/fmcc-f11-product-intelligence`  
**PR:** #11 — OPEN/DRAFT  
**Candidate funcional certificado:** `e5a3d9bef3451b32830315f6e1b9175f9fc06dff`  
**Produção:** fora do escopo

## Estado consolidado — 22/09/2026

| Bloco | Estado | Evidência |
|---|---|---|
| System Design F11 | CONCLUÍDO | `FMCC-11-PRODUCT-INTELLIGENCE-v0.1.md` |
| Product Registry | CONCLUÍDO | tenant-scoped + RBAC + slug único |
| Product scope | CONCLUÍDO | source/fact/metric com `product_id` opcional |
| Product Intelligence | CONCLUÍDO | overview + history + growth governado |
| Portfolio Comparison | CONCLUÍDO | moeda/período/missing fail-closed |
| UI/API F11 | CONCLUÍDO | produtos, overview e comparação |
| Core product-aware | CONCLUÍDO | catálogo autorizado + single/multi-product |
| Audit/provenance | CONCLUÍDO | product refs em evidence/audit |
| Migration | CONCLUÍDO | `0002_foundation.sql` |
| CI funcional | PASS | Foundation Gate #162 |
| Reconciliação documental | CONCLUÍDA | documentação atualizada nesta etapa |
| Preview/smoke F11 | PENDENTE | bloqueio operacional final |
| Merge PR #11 | NÃO AUTORIZADO | depende de gate final + autorização humana |

## Evidência automática

Foundation Gate #162 no candidate funcional `e5a3d9b...`:
- Install — SUCCESS;
- Lint — SUCCESS;
- Typecheck — SUCCESS;
- Verify migration matches schema — SUCCESS;
- Apply versioned migration — SUCCESS;
- Tests — SUCCESS;
- Build — SUCCESS;
- Docker build — SUCCESS;
- Runtime dependency audit — SUCCESS.

Resultado de testes:
- 20 test files PASS;
- 84 tests PASS;
- 0 FAIL.

Risco conhecido declarado:
- 4 vulnerabilidades `moderate` transitivas em tooling de desenvolvimento;
- nenhuma HIGH/CRITICAL bloqueando o gate vigente.

## Guardrails confirmados

- tenant continua autoridade server-side;
- Product Registry é autoridade de produto;
- productId não amplia tenant scope;
- source/fact/metric ficam isolados por produto quando há product scope;
- consulta global continua usando escopo sem produto;
- missing permanece unavailable, nunca zero;
- growth não cria score composto e depende de histórico comparável;
- Portfolio Comparison bloqueia moedas/períodos incompatíveis;
- Core recebe somente catálogo de produtos autorizado do tenant;
- slug não autorizado falha fechado;
- Core não cria produto nem substitui Metric Engine;
- evidence e Audit Ledger preservam product refs quando aplicável.

## Pendência única para gate operacional

Executar Preview/smoke da F11 no candidate final e comprovar:
- migrations aplicadas;
- health/ready;
- login/dashboard;
- criação/listagem de produto autorizada;
- abertura da visão individual;
- estados unavailable/pending semantics sem fabricação;
- comparação governada;
- consulta do Core direcionada a produto autorizado;
- ausência de cross-tenant/cross-product leakage.

**F11 não está encerrada e F12 não pode iniciar.**
