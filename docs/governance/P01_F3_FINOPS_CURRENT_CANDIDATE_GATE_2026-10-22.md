# P01 / F3 / F9 — current cross-runtime certification candidate (2026-10-22)

## Gate implementation
The Foundation workflow checks out these immutable Git SHAs in disposable GitHub Actions environments:
- Assistant: `8137e97a2dca2b2c76bc38607de17759dbbf6090`, including certified F4/WP2a source revocation; Assistant monolithic PR #1 remains **Draft**.
- Core: integrated F3 candidate SHA `9d9475b7b5c58b85156f3a388a0be54704689c5e` from Core PR #5 (AI Service + PostgreSQL gates green pre-merge), including strict per-attempt FinOps cost/count validation; Core monolithic PR #1 remains **Draft**.
- The Core contract gate executes signed Command quota readback, runtime mount and Command FinOps API, plus bucket-integrity and request/day-ledger tests with synthetic databases.
- The Command billing, cognitive, readiness, Foundation, secret scanning, Playwright, build, Docker and isolated PG jobs remain as before.

**STOP:** This is a certification candidate pin. Core PR #5 is merged into the candidate F3 branch and this workflow uses its resulting SHA. Still require a fresh Command CI pass on this exact pin, Core and Assistant post-merge CI verification, and repinning to the eventual final Assistant candidate SHA if Assistant PR #5 is also merged. Never inherit green from an older SHA.

Passing this workflow does not by itself certify F3 global or the monolithic Core/Assistant candidate PRs. Real providers/PSP, credentials, deploy, production migrations and external homologation remain deferred.
