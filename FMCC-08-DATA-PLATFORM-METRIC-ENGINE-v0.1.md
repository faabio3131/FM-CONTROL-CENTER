# FM CONTROL CENTER — F08 DATA PLATFORM + METRIC ENGINE

**Status:** EM EXECUÇÃO

## Objetivo
Materializar a autoridade determinística de métricas definida em F03/F04/F05.

## Implementação desta missão
- canonical facts;
- Metric Registry versionado em código;
- Metric Engine determinístico;
- MetricValue persistido;
- Metric Query Service;
- provenance/freshness/quality;
- isolamento tenant no store PostgreSQL;
- missing permanece diferente de zero;
- valor inválido não vira zero;
- multi-moeda é recusada sem política FX.

## Regras financeiras preservadas
`billing.gross_billed` não é `revenue.cash_collected`; receita não é lucro; nenhuma métrica de lucro é criada sem autoridade contábil; ADR-012 continua DEFERRED.

## Gate
Permanece EM EXECUÇÃO até migration, CI e regressão final estarem verdes.
