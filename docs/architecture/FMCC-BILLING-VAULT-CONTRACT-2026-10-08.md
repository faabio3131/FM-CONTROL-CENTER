# Gateway secret vault — boundary and implementation gate

Status: **contract implemented; secure provider/storage NOT implemented**. Financial writes are unavailable by design.

The existing Source Registry has a `secretRef` concept; it does NOT provide a multi-tenant
gateway-secret vault, encryption lifecycle or proof of ownership of a client-supplied reference.

A provider-neutral `CredentialVault` contract was added in
`src/domain/billing-central/gateway-management.ts`.
The vault must allocate references server-side after tenant-authorized capture of credentials;
encrypt with managed KMS/HSM or provider secret manager; segregate by tenant and environment;
support revocation/rotation; redact logs; prohibit export from listing APIs; reject replay and
client-chosen `credentialRef`; and audit each write/revocation.

`POST /api/billing/gateway-accounts/manage` authenticates the tenant and checks
`billing:write`, then returns 503 (no side effects). This is a deliberately disabled
management route, **not** a working create API.

Next implementation must integrate a **real secret manager**, verified configured provider
adapters, persisted account repository, tenant-scoped transactions and rate/CSRF controls.
Do not use development fallback or in-memory secrets in production; never enable payments
on account creation. Preserve separate operator/receiver tenants and approval gates.
