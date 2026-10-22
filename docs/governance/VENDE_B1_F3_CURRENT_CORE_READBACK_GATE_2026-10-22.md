# VendeAtendeIA — B1/F3 cross-repository release pin reconciliation

**Date:** 2026-10-22. **Product:** one SaaS (Assistant + Core). **Corporate Control Plane:** Command, separately administered.

## Exact CURRENT before this WP

- Source of truth: `faabio3131/-FM-Assistant-Base/docs/governance/CRONOGRAMA_MESTRE_CONSTRUCAO_100_INTERNA.md`. Active B1/F3, not F4; F0–F2 internally completed, F3/F9 still IN_PROGRESS.
- Assistant PR #1 Draft HEAD `8279f3c10993ace277f713c01688a3412fc3e92a`, 3/3 PR Actions successful.
- Core PR #1 Draft HEAD `5c685158755d19cf7f29b9e639efca1841c4cded`, 2/2 PR Actions successful. Core PR #3 read-only quota proof merged into this candidate branch, not to Core main.
- Command `main` at start `3fc44b2cfac3832cc4c36f48c197a30ec3708e2e` after PR #154 merged 4/4 green. Command Foundation previously pinned Core `6434dd81c056f5f3162f11aa6f624c625ceb4702`, **older than** Core #3. Thus success of Foundation at #154 **did not establish a cross-runtime gate against the new readback implementation**.
- Legacy open Command PRs #146, #147, #148, #149 retain old ancestor; they must be reconciled by unique diff and **must not** be blindly merged atop the newest Command main.

## B1/F3 work executed

1. Pin Core Foundation cross-runtime checkout to **exact current candidate** `5c685158755d19cf7f29b9e639efca1841c4cded`. Preserve certified Assistant SHA `8279f3c10993ace277f713c01688a3412fc3e92a`, not latest floating branches.
2. Require the real Core `test_ai_command_quota_readback.py` suite during Command Foundation, in addition to the previous cross-runtime suite, so a Core API regression cannot remain hidden behind unit mocks.
3. New `tests/f3_command_core_quota_readback_e2e.py`: disposable Assistant license and FM Core SQLite quota ledger, actual fresh signed Assistant grant, actual Core `PlanUsageGuard`, real FastAPI readback endpoint and HMAC, initially unprojected policy 409, positive after admission, tenant/unit negatives, suspension denial, no new reservation from read, reactivation continuing consumption history. This is NOT a live provider/network homologation.

## Gates and STOP

Foundation required at exact SHA: all original lint/types/schema/migrations/PostgreSQL/tests, newly pinned Python contract, package/build/Playwright/Docker/audit; other Command Billing PostgreSQL/F21/Cognitive unchanged and still obligatory. Review diff, CI and branch protection before any merge. **Any failure needs repair at root cause then full impacted rerun**. Core/Assistant main branches remain untouched, no new product/repo, and no provider, WhatsApp, gateway, secret, migration to real DB, deploy or external test was performed.

This WP certifies a specific **integration dependency and test harness**, not whole F3, not P01 closed, not B1 complete and not `BUILD_COMPLETE_INTERNAL_GREEN`.

## Gate adicional de montagem real (22/10/2026)

Auditoria de capacidade constatou que o Core PR #3 fornecia o router HMAC, mas `create_app()` não o registrava. PR Core #4 corrigiu a lacuna com FM-only runtime flag OFF, chave segregada, authority Assistant fresh, ledger canônico e testes HTTP reais. Merge Core na branch candidata PR #1: `c03ec3162d0fc55f061ce71cd5df2591c37ad919`.

Command Foundation deve agora fixar exatamente este commit e executar tanto `tests/test_ai_command_quota_readback.py` quanto `tests/test_ai_command_quota_runtime_mount.py` no mesmo checkout que exercita seus contratos Command↔Assistant. Sem isso a UI P01 poderia alegar integração de prova que o Core runtime não disponibilizava.

Core PR #1 Draft permanece em construção; nenhum deploy/configuração/secret real foi ativado. O objetivo deste WP é eliminar a divergência de versões entre Command e Core, não declarar F3 ou SaaS homologado. CI 3/3 Foundation/F21/Cognitive aplicáveis no HEAD e main pós-merge se acessível. Billing PG não precisa ser disparado sem mudança de billing.
