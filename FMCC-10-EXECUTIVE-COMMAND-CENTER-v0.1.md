# FM CONTROL CENTER — F10 EXECUTIVE COMMAND CENTER

**Status:** IMPLEMENTADA E TESTADA NA PR / PREVIEW E2E PENDENTE  
**HEAD verificado:** `8d2fee2d4db989cabcc19e485dcf0eb6d0ad48f7`  
**CI:** FMCC Foundation Gate #82 — SUCCESS

## Objetivo
Construir a primeira superfície executiva real usando as mesmas autoridades de F07/F08/F09.

## Implementação comprovada
- dashboard executivo server-side;
- cards vindos de MetricService/PostgreSQL;
- catálogo de KPIs-alvo com gaps explícitos;
- estados para dado indisponível;
- quality/freshness/source authority;
- período/as-of quando existente;
- tenant autenticado;
- painel do Core via `/api/core/query`;
- continuidade contextual tenant/user via audit ledger;
- suporte a análise multi-métrica para explicação, correlação, padrões, anomalia, risco e recomendação;
- Core indisponível degrada com segurança e não derruba o dashboard;
- responsividade básica;
- acessibilidade semântica básica;
- ausência de fonte nunca renderizada como zero;
- métricas sem semântica aprovada aparecem como pendentes, sem fabricar cálculo.

## Dados
Nenhuma fixture é exibida como dado real no dashboard. Sem ingestão real, os cards mostram indisponibilidade/fonte não conectada.

Dashboard e Core usam a mesma autoridade determinística de métricas.

## Evidência
- testes do Command Center;
- testes do Core Gateway;
- integração PostgreSQL F07/F08/F09;
- lint/typecheck/test/build/Docker/audit verdes no Gate #82.

## Dependência de gate
A UI está implementada e testada. O Core compartilhado canônico e o runtime dedicado já foram construídos. Falta apenas a prova operacional do fluxo completo em Preview, seguida do smoke pós-merge do FMCC.

## Gate
**F10 — IMPLEMENTADA/TESTADA, MAS NÃO CERTIFICADA COMO INTEGRADA EM PREVIEW.**

Não promover a homologada enquanto o smoke E2E Preview e o smoke pós-merge não existirem.
