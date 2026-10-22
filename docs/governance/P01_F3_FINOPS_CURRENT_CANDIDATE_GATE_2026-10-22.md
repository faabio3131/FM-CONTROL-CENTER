# P01 / F3 / F9 — current cross-runtime certification candidate (2026-10-22)

## Gate implementation
The Foundation workflow checks out these immutable Git SHAs in disposable GitHub Actions environments:
- Assistant: integrated F3 candidate SHA `46eff847208fe64379ddc9187962b3ec92157ead` from Assistant PR #5 (3/3 pre-merge gates success), including strict signed Core quota reader and prior F4 source revocation; Assistant monolithic PR #1 remains **Draft**.
- Core: integrated F3 candidate SHA `c699e1445e9130b6c917d7e5b5f0ab0a242a6ba5` from Core PRs #5 and #6 (both AI Service + PostgreSQL gates green pre-merge), including strict FinOps per-attempt validation and distinct cryptographic identity per physical IA invocation; Core monolithic PR #1 remains **Draft**.
- The Core contract gate executes signed Command quota readback, runtime mount and Command FinOps API, plus bucket-integrity and request/day-ledger tests with synthetic databases.
- The Command billing, cognitive, readiness, Foundation, secret scanning, Playwright, build, Docker and isolated PG jobs remain as before.

**STOP:** This certification candidate pins the *actual merged F3 candidate SHAs* of Core PRs #5/#6 and Assistant PR #5. Require a fresh Command Foundation + Cognitive + Readiness pass on the exact workflow commit, together with all applicable Core/Assistant post-merge gates. Never inherit green from an older SHA. Merge this Command WP only after review and these gates; do not merge the two monolithic Draft PRs based solely on this gate.

Passing this workflow does not by itself certify F3 global or the monolithic Core/Assistant candidate PRs. Real providers/PSP, credentials, deploy, production migrations and external homologation remain deferred.
