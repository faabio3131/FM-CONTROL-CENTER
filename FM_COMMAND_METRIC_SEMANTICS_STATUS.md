# FM Command — Metric Semantics Status

Data: 2026-10-01

## Executive Metric Registry
O CURRENT possui 24 targets executivos: 16 com definitionStatus=implemented e 8 com definitionStatus=pending_semantics.

## Pending semantics — bloqueio mantido
| metric_id | Estado | Contrato ausente |
|---|---|---|
| trial.active.count | EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED | definição as-of aprovada |
| trial.conversion.rate | EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED | coorte, janela e população |
| subscription.logo_churn.rate | EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED | coorte, janela e denominador |
| revenue.mrr | EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED | definição canônica de MRR |
| revenue.arr | EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED | definição canônica de ARR |
| finance.operating_result | EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED | composição financeira oficial |
| finance.operating_margin.rate | EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED | fórmula e base aprovadas |
| service.error.rate | EXTERNAL_BLOCKED / BUSINESS_SEMANTICS_REQUIRED | população, denominador e janela |

Nenhuma destas métricas foi promovida artificialmente para implemented. KCA-13 pode oferecer read models governados para parte delas, mas isso não substitui o contrato canônico do Metric Engine.

## Implemented targets preservados
trial.starts.count; subscription.active.count; subscription.cancelled.count; billing.gross_billed; revenue.cash_collected; receivable.delinquent_amount; cost.infrastructure.total; cost.operating.total; lead.created.count; incident.count; job.failure.count; integration.failure.count; service.error.count; usage.active_users.dau; usage.engagement.events; support.ticket.open.count.

## Evidência
- src/domain/metrics/registry.ts
- FMCC-PRODUCTION-SOURCE-INTEGRATION-DISCOVERY-v0.1.md
