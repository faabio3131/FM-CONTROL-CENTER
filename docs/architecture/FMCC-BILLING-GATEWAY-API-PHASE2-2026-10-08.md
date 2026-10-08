# Billing Central — Gate 2 (partial): gateway accounts

Status: **read-only foundation**, PR #62 (Draft). No merge, no deploy.

- `GET /api/billing/gateway-providers` lists planned providers with live payments disabled.
- `GET /api/billing/gateway-accounts` resolves the signed authenticated tenant membership and
  requires `billing:read`; the PostgreSQL query is scoped in a transaction with
  `set_config('app.billing_tenant_id', tenantId, true)` (transaction-local), on top
  of a tenant filter and RLS. Output excludes credential references.
- `POST/PATCH/DELETE` are **not available**. A read-only endpoint is not
  permission to manage actual money or activate a provider.
- The DB runtime role **must** be a non-superuser without BYPASSRLS; separate
  migration owner from the runtime principal. This is not yet certified in the
  deployed application.
- Before writes: dedicated secret vault, server-side schema validation, transaction-scoped
  persistence, audit, credential rotation, provider allowlist and live provider certification,
  CSRF/rate limiting, sandbox E2E and human approval.
- No arbitrary outbound GET/POST or user-supplied URLs; adhere to existing
  egress/SSRF policy.

Gate remains **partial** pending complete authorization and integration tests.
