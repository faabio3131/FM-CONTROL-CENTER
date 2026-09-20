# FM CONTROL CENTER — F10 EXECUTIVE COMMAND CENTER

**Status:** IMPLEMENTADA E TESTADA NA PR / CERTIFICAÇÃO FINAL PENDENTE DE F09 + PREVIEW PÓS-MERGE  
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
A UI está implementada e testada, porém o painel cognitivo real depende da conclusão do gate F09. Além disso, o smoke Preview pós-merge só pode ocorrer depois do merge final autorizado.

## Gate
**F10 — IMPLEMENTADA/TESTADA, MAS NÃO CERTIFICADA COMO INTEGRADA EM PREVIEW.**

Não promover a concluída/homologada enquanto F09 estiver bloqueada e o smoke pós-merge não existir.
