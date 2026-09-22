# FM CONTROL CENTER — F12 FINANCIAL & UNIT ECONOMICS SYSTEM DESIGN

**Fase:** F12 — 71% → 77%  
**Status:** SYSTEM DESIGN APROVADO PARA IMPLEMENTAÇÃO NA PR #12

## Autoridades

- Tenant/Auth: identidade, organização e autorização.
- Product Registry: produto.
- Integration Fabric: fonte e ingestão.
- Canonical Facts: fatos financeiros provenientes de fonte autorizada.
- Metric Registry: semântica/versionamento.
- Metric Engine: cálculo factual determinístico.
- Financial Intelligence: composição determinística de indicadores derivados.
- FMCC Core: interpretação/síntese; nunca ledger ou calculadora autoritativa.
- Audit/provenance: rastreabilidade.

## Facts adicionais permitidos

- `receivable.delinquent`: payload `amount`, `currency`;
- `cost.infrastructure`: payload `amount`, `currency`;
- `cost.operating`: payload `amount`, `currency`.

Nenhum fact é produzido sem Source Definition autorizada.

## Métricas base

- `receivable.delinquent_amount`;
- `cost.infrastructure.total`;
- `cost.operating.total`.

Todas usam soma decimal exata, moeda explícita e período governado.

## Indicadores derivados

### Resultado operacional governado

`cash_collected - infrastructure_cost - operating_cost`

Pré-condições:
- todas as entradas disponíveis;
- mesma moeda;
- período temporal exatamente compatível.

Caso contrário: `unavailable` ou `incompatible`.

### Margem operacional

Permanece `pending_semantics` nesta versão até política de denominador/arredondamento ser formalmente aprovada.

## Unit economics

- CAC: pending_semantics;
- LTV: pending_semantics;
- payback: pending_semantics;
- ARPU: pending_semantics.

Nenhum será calculado por aproximação.

## Segurança

- tenant/product scope server-side;
- nenhum secret em fact/config/log;
- nenhuma operação financeira;
- nenhuma autorização delegada ao Core;
- valores ausentes nunca viram zero.
