# FM CONTROL CENTER — F10 EXECUTIVE COMMAND CENTER

**Status:** EM EXECUÇÃO

## Objetivo
Construir a primeira superfície executiva real usando as mesmas autoridades de F07/F08/F09.

## Implementação desta missão
- dashboard executivo server-side;
- cards vindos de MetricService/PostgreSQL;
- estados explícitos para dado indisponível;
- quality/freshness/source authority;
- tenant autenticado;
- painel do Core via `/api/core/query`;
- Core indisponível degrada com segurança e não derruba o dashboard;
- responsividade básica;
- acessibilidade semântica básica;
- ausência de fonte nunca renderizada como zero.

## Dados
Nenhuma fixture é exibida como dado real no dashboard. Sem ingestão real, os cards mostram indisponibilidade/fonte não conectada.

## Gate
Permanece EM EXECUÇÃO até CI, migration, diff review e smoke Preview.
