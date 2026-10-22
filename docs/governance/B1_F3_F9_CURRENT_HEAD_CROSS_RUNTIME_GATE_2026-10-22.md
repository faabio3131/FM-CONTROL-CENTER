# VendeAtendeIA — B1/F3/F9 Current-HEAD cross-runtime CI gate (2026-10-22)

## Purpose
Certify a new Command Foundation integration against the **current green candidate code** from FM Assistant and FM Core, not just older pinned SHAs. This is an internal synthetic gate, independent of external credentials/deploy.

## Exact dependency candidates
- Command main base: `78f29c4299528619a70ac154afd1a1bae6cac753` (PR #160 integrated, post-merge CI must still be checked independently).
- FM Assistant `feat/saas-foundation-v1`: `9ad92d0508911782bd4029a1ff94b4d2ede63682`, incorporating scoped knowledge F4 WP1 (PR #2). Assistant candidate is **not merged into its main**.
- FM Core `feat/ai-service-v1`: `caf2ec9c47015ed8252566d258a3163af62faaaa`, includes authenticated quota readback, guarded recovery and FinOps reporting; **not merged into its main**.

## What changed
1. Re-pin the exact Assistant and Core SHA in `.github/workflows/fmcc-foundation-gate.yml`; checkout is read-only with `persist-credentials: false`.
2. Preserve existing Node Command ↔ real Python Assistant ↔ real Python Core synthetic contract tests, quotas, recovery and QR/license negative paths.
3. Add `core-source/tests/test_ai_command_finops_api.py` to the Foundation pytest gate to exercise the Core F9 report boundary from the exact newly pinned source, alongside quota readback and mounted runtime tests.
4. Preserve all existing Foundation steps (lint, types, tests, schema check, disposable PostgreSQL migrations, secret scan, build, browser E2E, runtime smoke, Docker build and dependency audit). No gate weakening.

## Acceptance
- Four Command PR workflows executed and green on the final HEAD, including the full Foundation and isolated PostgreSQL.
- Assistant and Core target SHAs independently green in their own branch workflows.
- Review the diff, confirm zero new secrets/migrations/provider calls/deploy, and verify no STOP.
- Merge to Command main only after its prior merge CI is green and this PR is eligible; then verify all four post-merge Command workflows.

## Limitations
This does **not** prove that Core or Assistant feature branches are merged into their respective `main` branches, nor does it close B1/F3, certify external provider cost, license lifecycle in real systems, TLS/Vault or production. The FM Core S2S report is intentionally opt-in/OFF by default; no real keys or gateways are configured. Real third-party testing follows `BUILD_COMPLETE_INTERNAL_GREEN`.

## Rollback
Revert this isolated workflow/documentation change; no databases, external services, contract state or runtime configuration are changed.

## Gate status at creation
`PENDING_CI` — do not infer green from code or the previous pinned versions.
