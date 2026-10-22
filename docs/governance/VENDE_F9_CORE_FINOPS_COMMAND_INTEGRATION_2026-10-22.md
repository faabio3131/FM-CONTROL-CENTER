# VendeAtendeIA — FM Command F9 Core FinOps integration

**Build status:** integration code and synthetic tests; External Core endpoint configuration **OFF by default**, not homologated. Do not mix provider cost with customer subscription billing.

## Chain of authority

FM Command corporate session (`owner/admin` + `commercial:read`) → product ID registered to the FM tenant → canonical `fmcc_billing_customer_binding` for the VendeAtendeIA product and external tenant → dedicated HTTPS Core origin → signed Core FinOps report → FM-only dashboard.

- Client/browser never obtains S2S key, pays provider fees or controls the Core's cost ledger.
- Command is the authority for subscription revenue and canonical product/customer mapping.
- Core is the authority for provider/attempt usage and internal technical cost estimates.
- Assistant remains the authority for runtime license state and individual tenant/unit access.
- Query allows an FM operator to specify the tenant's **external mapped ID** and an assistant unit ID, and cannot sign an unmapped tenant. Product binding and FM permissions are enforced before network calls.
- The production composition root needs authoritative unit enumeration and rate limits as operational controls; no implicit global cross-tenant aggregation is enabled.

## Configuration surface (later; no real credentials now)

```dotenv
FM_COMMAND_CORE_FINOPS_ENABLED=false
FM_COMMAND_CORE_FINOPS_ORIGIN=https://core.example.test/
FM_COMMAND_CORE_FINOPS_SECRET=<configured-through-secret-manager-after-build>
```

The distinct secret must be shared with the Core's opt-in `command_finops_router`, never with a browser, assistant plan projection, payment gateway or AI model. TLS-only URL, exact path, no credentials or query string in URL; request HMAC SHA256, cryptographically random nonce, UTC timestamp.

The parent Core implementation is pending in `faabio3131/FM-Core-Base-` PR #2 targeting its candidate F3 branch; without it, this read path must remain OFF and the FM panel displays "indisponível" instead of fabricated consumption.

## Internal API

`POST /api/billing/products/{productId}/vende-core-finops`

JSON contains exactly `externalTenantId`, `unitId`, `startDate`, `endDate`. The route limits the body, checks UUID and scope, and resolves FM operator server session before reading data. It cannot be used for provider writes or PSP mutations.

The bridge signs the exact Core read contract; it validates all balances/attempts, tenant/unit/date and completeness flags in the Core reply, dropping unexpected metadata. The FM dashboard shows token/fallback counts and decimal string subtotals grouped by provider and currency; flags unknown costs explicitly. It never claims an actual provider charge is verified.

## Certification gates and limits

- Unit tests: HMAC, environment OFF, HTTPS, financial precision, data minimization, fail-closed validator, impossible metrics, time windows.
- HTTP tests: FM corporate route validation, no-store, oversized payload, spoofed tenant, no leakage on error.
- CI lint/typecheck/build/unit/PG/F21 on exact SHA required; independent review and post-merge before integration.
- External tests with real Core/Assistant servers, real secrets, providers and PSP deferred until 100% internal construction. **This is not proof of deployed or verified provider cost**.

## Rollback

Set `FM_COMMAND_CORE_FINOPS_ENABLED=false` (default) or omit any Core origin/key; the panel remains visible with an unavailable message, but no network request is made. Revert isolated code and routes without data migrations, license mutations or loss of accounting history.


## Cliente selecionado no Command

A rota corporativa `GET /api/billing/products/{productId}/vende-core-finops/bindings` lê no máximo 51 `fmcc_billing_customer_binding` do produto ativo VendeAtendeIA, ordenados por external tenant ID, e publica apenas os primeiros 50 com `truncated`. O painel pode sugerir IDs que **já pertencem** à FM neste produto; não concede direito de uso de outra unidade nem consulta automaticamente provedores. A consulta principal **revalida o binding** no servidor antes de assinar qualquer chamada do Core.

## Teste de atribuição PostgreSQL

`tests/vende-core-finops-postgres.test.ts` cria produto VendeAtendeIA, produto distinto, cliente e vínculo externo em banco isolado; prova o lookup governado e que tenant inexistente, produto diferente e produto sem vínculo são rejeitados antes de enviar uma requisição. A chamada sintética inspeciona o HMAC e o `tenant_id` exato, sem credencial real. Os dois contratos de assinatura Node e Python também compartilham um golden vector SHA256, garantindo compatibilidade de bytes entre as implementações sem exigir servidores externos.

A lista não substitui a necessidade de uma futura API autorizada do Assistant para listar unidades e conferir sua licença. Sem ela, o operador FM ainda fornece o ID da unidade confiável; a autorização para consumir quota permanece governada no Assistant/Core.
