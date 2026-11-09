## Cakto / FM Command V1 - commercial gate
- Authority: FM Command V1 owns platform invoices, payments, recurring cycles and license outbox; IRON owns entitlements. Never route this through Command V2 or academy-to-student finances.
- New additive V1 migration: 0021; never transplant V2 migration/snapshot.
- S2S checkout is OWNER plus step-up at IRON, authenticated with an independent token at FM Command; checkout requires the canonical invoice and official offer binding. Redirect alone never grants entitlement.
- Webhook requires official HMAC over raw request, timestamps and a unique payment reference; no customer-provided tenant scope, emails or CPF as authority.
- Delivered entitlements are idempotent and retryable via persistent outbox; worker must only activate the still ACTIVE paid subscription, never one cancelled or refunded meanwhile.
- OFFLINE CONFIGURATION REQUIRED: create real Cakto account offer IDs, checkout URLs, webhook secret, FM tenant/product bindings, control-plane token, and recurring worker schedule via secured runtime settings before opening live checkout.
- Actual Cakto purchase, refund and cancellation need separate provider-authorized execution evidence; synthetic HMAC/test PostgreSQL does not certify provider production.