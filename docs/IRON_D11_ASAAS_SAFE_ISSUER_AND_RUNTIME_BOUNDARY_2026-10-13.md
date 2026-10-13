# IRON D11 — Safe generic Asaas Pix issuance in FM Command

Date: 2026-10-13. Current baseline Command `f865e45b9994c8a564d07b158354bbf3c2a6ce6f`. IRON owns runtime entitlements; Command owns FM→academia billing.

## Scope

Adds generic guarded **IRON** Asaas Pix charge issuance from canonical FM Command invoices, without copying invoice/subscription rules into IRON and without using the old fixed-value Kordena pilot.

- The Command authoritative plan/invoice amount, academy binding, gateway account, active product route, immutable IRON plan code/version mapping and creation date are read from its PostgreSQL.
- The Asaas customer MUST already exist with an exact provider-side `externalReference=fmcc-iron-customer-<gymUUID>` and a verified `cus_...` ID. Do not trust a freely chosen customer ID or phone/email/CPF from the browser. Customer enrollment is a separately governed prerequisite and is not assumed complete.
- Authenticated `GET /customers/{id}` proves the canonical academy identity; input provides only invoiceId, Asaas customer ID and due date. Financial amount and reference cannot come from input.
- Exactly one persisted `fmcc_billing_iron_issue_claim` reserves the invoice **before contacting** the provider, with a unique invoice and `externalReference=fmcc-iron-<invoiceUUID>`. New Drizzle additive migration `0008_foundation`.
- The issuer always preflights `GET /payments?externalReference=...`. Zero candidates permits **one** `POST /payments` on the *new* reservation only. A nonempty, ambiguous or incomplete provider response cannot generate another POST.
- Timeout, network error or persistence failure is marked uncertain. Another attempt uses **GET-only recovery**, never automatic POST replay; missing payment after uncertainty is a human-review gate. Provider ID is persisted under the same local invoice + gateway binding with idempotent conflict checks.
- Provider confirmed receipt, refund, audit and IRON entitlement outbox are handled by the previously certified D11 reconciliation, not by issuance. Issuance itself cannot grant license.
- `POST /api/billing/products/:productId/iron-license/asaas-issue`: `{action:"issue",password,invoiceId,customerId,dueDate}` or `{action:"recover",password,invoiceId}`. Owner/admin, billing write permission, password step-up and **FM control tenant** only. Flag `FMCC_IRON_ASAAS_ISSUANCE_ENABLED=YES` default OFF.

## Operational limitations / gates

The provider customer enrollment and provider-account KYC need certified readiness; no claim that new IRON subscribers can already purchase or that the Asaas account is homologated for generic Pix. The migration is additive and must be checked against the specific runtime database before any flag is enabled. The real business calendar/tax/fiscal policy, provider webhook inbox, scheduled worker and tenant plan transitions remain separate gates. Production payment POST is never called by CI.

**Out of scope:** gym→student financial operations remain inside IRON and never pass through the FM Command SaaS billing issuer. The Command manages FM→gym invoices only.

## Data/API boundary of IRON-owned external APIs

Per the user-approved architecture, the API that feeds IRON's own business features must execute **in IRON**. Command may centrally provision managed configuration/secret references, quotas, cost allocation and read **governed usage reports**, but must not proxy every operation, become the IRON domain runtime, expose credentials to browsers, or claim ownership of its operational API. Specifically, IRON's current `src/modules/ai/` and `src/modules/integrations/` already own runtime abstractions, local authorization and secret resolution; the corresponding Command deployment interface and capability-specific metering still require explicit code-level reconciliation. A provider adapter is not proof of a live provider. No imaginary nutrition/data-ingestion endpoint has been introduced by this work.

## Evidence

Tests and GitHub CI provide evidence only once executed. No payment has been created by this feature during this internal implementation.
