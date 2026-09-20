# FM CONTROL CENTER — F07 INTEGRATION FABRIC

**Status:** EM EXECUÇÃO  
**Baseline:** F06 certificada em Preview  
**Branch:** `feat/fmcc-f07-f10-intelligence-stack`

## Objetivo
Implementar o boundary governado de integrações do FMCC sem acoplar domínio a providers.

## Current anterior
F06 possuía auth/tenant/audit/runtime, mas nenhum Source Registry, Connector Runtime ou canonical ingestion.

## Implementação desta missão
- Source Registry tenant-scoped;
- secret-by-reference;
- contratos de connector;
- runtime de pull com timeout, idempotência, cursor/checkpoint e erro normalizado;
- sync execution record;
- canonical facts com provenance;
- adapters PostgreSQL;
- API server-side de fontes;
- testes unitários e adversariais de RBAC/tenant;
- integração PostgreSQL adicionada à matriz.

## Limites
Nenhum provider externo real é declarado integrado. Fixtures/fakes de testes são explicitamente não-produtivos.

## Gate
Permanece EM EXECUÇÃO até migration, CI e regressão final estarem verdes.
