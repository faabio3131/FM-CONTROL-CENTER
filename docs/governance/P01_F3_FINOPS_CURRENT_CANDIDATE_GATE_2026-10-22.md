# P01 / F3 / F9 — current cross-runtime certification candidate (2026-10-22)

## Gate implementation
The Foundation workflow checks out these immutable Git SHAs in disposable GitHub Actions environments:
- Assistant: `8137e97a2dca2b2c76bc38607de17759dbbf6090`, including certified F4/WP2a source revocation; Assistant monolithic PR #1 remains **Draft**.
- Core: initial **pre-integration** PR #5 SHA `24cd080f73103ffa4529d76d99476b85bf2b48b3`, including strict per-attempt FinOps cost/count validation; Core monolithic PR #1 remains **Draft**.
- The Core contract gate executes signed Command quota readback, runtime mount and Command FinOps API, plus bucket-integrity and request/day-ledger tests with synthetic databases.
- The Command billing, cognitive, readiness, Foundation, secret scanning, Playwright, build, Docker and isolated PG jobs remain as before.

**STOP:** This is a candidate pin. Before merging this Command PR, Core PR #5 must be internally audited, pass its applicable gates, merge to the Core candidate branch, and the workflow must repin the *actual resulting Core candidate SHA* with a fresh Command CI pass. No inherited green from an older commit.

Passing this workflow does not by itself certify F3 global or the monolithic Core/Assistant candidate PRs. Real providers/PSP, credentials, deploy, production migrations and external homologation remain deferred.
