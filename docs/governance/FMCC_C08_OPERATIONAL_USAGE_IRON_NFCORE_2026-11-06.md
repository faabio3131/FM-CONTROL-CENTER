# C08 — IRON + NFCore operational usage readback (2026-11-06)

## Scope and authorities
- Baseline main verified before work: `74cb0d249b49c646bb0fab0d0d0220bf11ab86d1`.
- Read-only Command server-to-server consumers; no writes to IRON or NFCore.
- **IRON authority:** `iron.fmcc.ai-usage.v1` under `/api/v1/control-plane/fmcc/usage/ai?days=30`; actual persisted trace-execution counts for a 30-day window; unavailable detailed metrics remain unavailable.
- **NFCore authority:** `nfcore.fmcc.operational-usage.v1` under `/v1/command/operational-usage/snapshot`; quota limits and measurements as stored by product, including `used:null, unavailable:true`.
- Independent new authoritative domain `operational-usage` (not commercial or cognitive), with dedicated adapter type and secret reference per product.
- Reading the snapshots does not authorize, enforce or reset quotas; no billing, payments or money semantics are produced. Command remains its own authority for commercial decisions.

## Implementation
- Transport helper: exact source/tenant/secret reference, origin-only HTTPS allowlist, no redirect, dedicated bearer, validated correlation, bounded deadline covering response body and 1 MiB response cap.
- Connectors: `IronUsageConnector`, `NfcoreOperationalUsageConnector`. Read-only `snapshot()` and `health()`; intentionally **no** `pull()` to prevent accidental ingestion and confusing this projection with a synchronizer fact.
- NFCore parser validates single deterministic summary hash, summary totals, row invariants, required correlation and provenance.
- IRON parser validates exact schema/product/metric, group counters, canonical trace provenance and explicit unavailability types.
- Projection strips tenant and subscription identifiers before serializing UI response; aggregates IRON by capability/provider/model/status, NFCore by metric identifier. A partially missing quota meter results in a null grouped usage value rather than an understated total.
- Endpoint `GET /api/sources/{sourceId}/usage`: session, owner/admin, source/integration/metric read permissions, tenant, product, binding and source-type fencing; no-store and sanitized failures; audit.
- UI: distinct **Ver consumo operacional** action for IRON and NFCore, independent **Fechar ×** panel. The operator is told when the new usage-source adapter has not been registered. Sync button is deliberately hidden for usage-only adapters.
- Existing commercial and cognitive panels are preserved; source registration supports multiple adapters per product on the checked baseline, with no changes to the legacy store schema.

## Environment — NOT CONFIGURED OR VERIFIED BY THIS WORK
- Command IRON: `FMCC_IRON_USAGE_CONTROL_PLANE_TOKEN`, existing `FMCC_IRON_CONTROL_TENANT_ID`, `FMCC_IRON_ALLOWED_ORIGINS`.
- Command NFCore: `FMCC_NFCORE_OPERATIONAL_USAGE_CONTROL_PLANE_TOKEN`, existing `FMCC_NFCORE_CONTROL_TENANT_ID`, `FMCC_NFCORE_ALLOWED_ORIGINS`.
- NFCore provider: `NFCORE_COMMAND_OPERATIONAL_USAGE_CONTROL_PLANE_TOKEN`. Do not assume that the two values match, or configure them automatically.
- Real secrets, SaaS availability, endpoints, production configuration and deploy require separate owner approval and authenticated external validation.

## Dependency status
- NFCore PR #381 was open/unmerged at intake: code available for contract inspection, NOT evidence of deployed route.
- FM Command PR #211 had been merged into checked main; current multi-adapter UI/preflight code was preserved, not duplicated.
- IRON existing product read model uses `FmCommandControlPlaneGuard`, no new writes or product code changes.

## Validation status
- Test set: parsing, wrong schemas/products, missing measurements, forged correlation/hash, malformed origins, response bound, timeout, privacy sanitization, and UI independent close.
- Unit, lint, TS typecheck, production build, CI green status and independent review to be attached with actual evidence. Do not infer homologation from code or CI.
- No merge or deploy authorized as part of this PR. Rollback: revert this self-contained adapter/read-route/UI change; existing commercial and cognitive flows remain unaffected.
