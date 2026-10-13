# D11 — Controlled IRON outbox dispatcher

Date: 2026-10-13

## CURRENT
FM Command `main@08547a287e1057d6a4cedec0ff93598edda7533c` has an isolated-CI-certified, durable outbound license ledger (PR #75) and the previous manual paid-invoice verification gate; IRON already exposes a bearer-protected, audited, idempotent `subscription.status.sync` API. The Command owns the billing/payment state, IRON owns the entitlement.

## This delta
`GovernedIronOutboxDispatcher` reuses the existing connector and outbox with a **manual, privileged, default-disabled** operation at:

`POST /api/billing/products/:productId/iron-license/outbox`
- `{ "action": "enqueue", "password": "...", "invoiceId": "<UUID>", "eventType": "LICENSE_ACTIVATE|LICENSE_SUSPEND|LICENSE_CANCEL" }`
- `{ "action": "process_one", "password": "..." }`

The route requires authenticated Command admin/owner, `billing:write`, password step-up, FM control tenant identity and exactly one canonical IRON integration source. Both actions additionally require `FMCC_IRON_OUTBOX_MANUAL_OPERATIONS_ENABLED=YES`. `process_one` independently requires `FMCC_IRON_OUTBOX_DELIVERY_ENABLED=YES` AND the previously existing `FMCC_IRON_PAID_LICENSE_RECONCILIATION_ENABLED=YES`; all flags remain OFF.

The dispatcher:
- claims one tenant/product-scoped outbox event with a fenced 90-second lease;
- revalidates current invoice + provider payment + FM billing subscription status and source/gym binding immediately before sending;
- for activation, requires paid+received production gateway/route; for suspension/cancellation, validates Command canonical `past_due` / `cancelled` without depending on a gateway account staying enabled or routed;
- verifies the authoritative IRON snapshot, exact gym and immutable `planCode + version`, unique subscription and timestamp freshness;
- blocks reactivation of canceled subscriptions and expired activations;
- sends only the existing `subscription.status.sync` command, with stable `fmcc:iron:outbox:v1:<event UUID>` idempotency across retries;
- checks the returned IRON tenant/subscription/status/plan before ACK;
- ACKs under an unexpired claim token or retries with bounded backoff and safe error code; terminal contract/state violations mark the event blocked;
- audits all operator actions without payment credentials or raw provider payloads.

## Operational boundaries
**No real financial or entitlement action executed here.** No webhook ingestion, automatic provider-confirmed enqueue or scheduler/always-on worker yet. This is a controlled manual bridge only after explicit environment setup and source credential E2E. There is no frontend claiming self-service activation.

Drizzle `0007_foundation` was certified in disposable CI PostgreSQL as part of PR #75, but the application of this migration to the operational Render PostgreSQL remains **unverified**. Do not enable dispatch flags while that remains so.

Still mandatory: provider-authenticated payment and reversal processing, transactionally integrated outbox enqueue in the same database transaction as provider-confirmed financial state, durable orchestrated scheduled processing, chargeback/dunning/grace-policy handling, tenant-ID/plan lifecycle transitions, staging/production E2E, operational backup/migration evidence.

IRON Macro O Visual Premium PR #22 remains Draft/unmerged awaiting explicit visual approval.

## Checkpoint
- Macro O / D11 / FM Command.
- Branch: `feat/d11-governed-iron-outbox-dispatch`.
- PR and CI status must be recorded after actual execution, not inferred.
- No live flags or external service entitlement changes.
