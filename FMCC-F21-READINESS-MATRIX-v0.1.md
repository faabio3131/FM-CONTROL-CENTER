# FMCC — F21 Readiness Matrix v0.1

Baseline: main@e6d6e9b33f126d210651a4adbb3ed14ed12b0492
Working branch: feat/fmcc-f21-readiness-pre-premium-final
Status: CURRENT DISCOVERY / EXECUTION IN PROGRESS

| Item | CURRENT | TARGET | Evidence / gap | Severity | External blocker | Status |
|---|---|---|---|---|---|---|
| Authentication | Better Auth + server-side protection certified in F20 | preserve | F20 + tests | — | no | verified |
| Authorization/RBAC | server-side permissions + step-up paths | preserve | F20/security tests | — | no | verified |
| Tenant isolation | tenant-first repositories + adversarial coverage | preserve | integration/adversarial tests | — | no | verified |
| Sessions | protected dashboard/auth flows | preserve | Preview + E2E | — | no | verified |
| Secrets | env/secretRef + sanitizer + scan | preserve/operationalize rotation | runbook gap | medium | no | implementing |
| APIs | protected contracts | preserve | F20 | — | no | verified |
| Cognitive Core | product-owned, grounded, fail-closed | preserve | cognitive gate/F20 | — | provider runtime may vary | verified |
| Core × deterministic authority | separated | preserve | ADRs/tests | — | no | verified |
| Integration Fabric | retries/idempotency/timeout/provenance | preserve | F20 | — | no | verified |
| Kordena runtime | contract certified, real FMCC runtime not proven connected | real runtime evidence when secrets exist | credentials/source/health/sync absent | external | CREDENTIAL_REQUIRED | blocked externally |
| Source Registry | governed and tenant-scoped | preserve | tests | — | no | verified |
| Canonical facts | governed ingestion/provenance | preserve | tests | — | source availability varies | verified |
| Provenance | persisted/required in governed flows | preserve | tests | — | no | verified |
| Metric Registry | 24 executive targets, some pending semantics | no invented semantics | registry/discovery | external | BUSINESS_SEMANTICS_REQUIRED | explicit |
| Metric Engine | deterministic supported metrics | preserve | tests | — | no | verified |
| Alerts | deterministic, idempotent, auditable | preserve | F20 | — | no | verified |
| Automation scheduler | workflow exists; runtime vars not proven configured | real scheduled evidence when vars exist | env runtime evidence absent | external | RUNTIME_SECRET_REQUIRED | blocked externally |
| Audit Ledger | append-only logical + sanitizer | preserve | ADR/F20 | info | retention decision external | accepted |
| Migrations | versioned + schema gate | preserve | Foundation Gate | — | no | verified |
| DB constraints | explicit schema/indexes | preserve | schema/tests | — | no | verified |
| Logging | structured JSON + redaction | operational runbook | logger exists | low | no | implementing |
| Health | endpoint certified | preserve | Preview gate | — | no | verified |
| Readiness | endpoint certified | preserve | Preview gate | — | no | verified |
| Correlation | integration/core/audit coverage | preserve | implementation/tests | — | no | verified |
| Observability | logs + health/readiness; no approved SLO/vendor | honest operational readiness | no uptime/SLO fabrication | external | provider/SLO decision for deeper layer | partial/explicit |
| Backup | provider plan evidence unknown; no repository restore proof | real non-prod restore proof | gap | high | provider retention unknown | implementing CI proof |
| Restore | no repository-level restore gate | isolated restore smoke | gap | high | no for CI | implementing |
| Rollback | prior redeploy possible; no consolidated runbook | explicit code/config/schema/data process | gap | medium | no | implementing |
| Incident handling | principles exist, no consolidated operational runbook | executable runbook | gap | medium | no | implementing |
| CI | Foundation + cognitive + Preview gates | add F21 readiness gate | readiness proof missing | medium | no | implementing |
| Docker | certified | preserve | F20/Foundation | — | no | verified |
| Supply chain | lockfile/npm ci/SHA-pinned Actions; 4 MODERATE dev tooling | preserve and re-audit | accepted F20 risk | accepted | safe upgrade not established | accepted |
| Preview/Staging | exact SHA/health/ready/auth gate | homologate final F21 SHA | candidate not yet deployed | gate | Render deployment needed | pending |
| Runbooks | fragmented docs | consolidated operational runbook | gap | medium | no | implementing |
| Config contracts | env example + runtime validation | preserve and validate | contract check needed | low | runtime values external | implementing |
| Operational documentation | historical docs exist | reconcile F21 CURRENT | gap | medium | no | implementing |

## Explicit external blockers

- Kordena real runtime credentials/source: CREDENTIAL_REQUIRED.
- Alert scheduler real runtime configuration: RUNTIME_SECRET_REQUIRED.
- Provider decisions for billing invoices, monetary delinquency, infra FinOps, operating costs, CRM/leads, incident authority, service-error authority, usage/engagement and support: PROVIDER_DECISION_REQUIRED unless newer CURRENT proves otherwise.
- Pending executive metric semantics: BUSINESS_SEMANTICS_REQUIRED.
- Provider-specific backup retention/RPO/RTO and deeper observability/SLO policy: do not invent.

External blockers do not authorize fake data, fake providers or a false CONNECTED state.
