# FM CONTROL CENTER — F13 GROWTH / COMERCIAL

**Fase:** F13 — 77% → 81%  
**Status inicial:** CURRENT DISCOVERY + SYSTEM DESIGN

## Current Discovery

Existe:
- `trial.started` e `trial.starts.count`;
- Product Registry;
- canonical facts genéricos;
- Metric Engine;
- product scope.

Não existe no repositório:
- CRM canônico;
- HubSpot/Meta/Google/Cakto como autoridade;
- UTM/attribution contract aprovado;
- lead source provider;
- conversão trial→assinatura com definição de coorte;
- CAC calculável.

## Design

Novo fact suportado:
- `lead.created` para contagem de leads, somente quando fonte autorizada o emitir.

Nova métrica base:
- `lead.created.count`.

Permanecem pending_semantics:
- `trial.conversion.rate`;
- `acquisition.cac`;
- atribuição por canal;
- funil multiestágio que não possua eventos canônicos.

A visão Growth consulta métricas governadas por tenant/produto e sempre expõe provenance, período, quality e freshness.

O Core pode explicar métricas existentes, mas não inventar atribuição ou conversão.
