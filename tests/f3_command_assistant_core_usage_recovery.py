"""Three codebase synthetic cross-runtime integration (NOT network homolgation).

Actual Command Node JS production signer + actual Assistant ASGI authority +
actual Core quota ledger, recovered through Core FastAPI router and synthetic
verified provider evidence. Uses disposable SQLite; the Core/Assistant
PostgreSQL contention gates are separately required.
"""
from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from core.ai_admin_audit import CommandAdminAuditRecord
from core.ai_command_authority import CommandTrustPolicy
from core.ai_control_plane import ControlPlaneBase
from core.ai_governed_recovery_api import governed_recovery_router
from core.ai_provider_evidence_store import (
    TrustedProviderEvidenceStore,
    sign_verified_gateway_attestation,
)
from core.ai_quota_store import QuotaRequirement, QuotaReservations
from core.ai_verified_usage_receipt import VerifiedProviderUsageReceipt

from f3_command_assistant_cross_runtime import (
    assistant_fixture, invoke, signed_node_request,
)

ROOT = Path(__file__).resolve().parents[1]
TRANSPORT_KEY = "synthetic-command-recovery-service-key-32-bytes"
TOKEN_SCRIPT = ROOT / "tests/f3-command-core-ai-recovery-token.mts"


class SyntheticVerifiedProvider:
    def verify(self, *, evidence_id, request_id, tenant_id, unit_id):
        assert evidence_id == "provider-proof-1"
        return VerifiedProviderUsageReceipt(
            provider="gemini", model="synthetic-model", request_id=request_id,
            tenant_id=tenant_id, unit_id=unit_id,
            input_tokens=140, output_tokens=60,
            provider_cost_usd=Decimal("0.0025"),
            evidence_digest="a" * 64,
        )


def test_command_assistant_core_revocation_quota_and_recovery(
    assistant_fixture, tmp_path,
):
    assistant, _, reference = assistant_fixture
    # Assistant has a synthetic active Core service identity in fixture.
    raw, headers = reference.signed_request()
    assert assistant.post(reference.PATH, content=raw, headers=headers).status_code == 200

    now = datetime.now(UTC)
    engine = create_engine(f"sqlite:///{tmp_path / 'core-recovery.sqlite3'}")
    ControlPlaneBase.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    quota = QuotaReservations(sessions)
    try:
        quota.project_signed_grants(
            tenant_id="tenant-a", unit_id="unit-a", revision=2,
            grants=(("ai.requests", "tenant", 10, 3600),
                    ("ai.total_tokens", "tenant", 1000, 3600)),
        )
        quota.reserve_bundle(
            needs=(
                QuotaRequirement(
                    tenant_id="tenant-a", unit_id="__tenant__",
                    capability="ai.requests", units=1, policy_revision=2,
                ),
                QuotaRequirement(
                    tenant_id="tenant-a", unit_id="__tenant__",
                    capability="ai.total_tokens", units=400, policy_revision=2,
                ),
            ),
            request_id="usage-1", at=now,
        )
        output = subprocess.run(
            ["node", "--experimental-strip-types", str(TOKEN_SCRIPT)],
            check=True, cwd=ROOT, capture_output=True, text=True, timeout=20,
        )
        signed = json.loads(output.stdout)
        policy = CommandTrustPolicy(
            issuer="fm-command-synthetic", audience="fm-core-ai-recovery",
            public_key_pem=signed["public_key_pem"],
        )
        # A separately authenticated FM provider gateway stores the exact
        # scoped evidence once. The Core recovery route reads this record,
        # never raw/unverified JSON supplied by the Command request.
        proof = SyntheticVerifiedProvider().verify(
            evidence_id="provider-proof-1", request_id="usage-1",
            tenant_id="tenant-a", unit_id="unit-a",
        )
        gateway_key = b"synthetic-evidence-gateway-isolated-key-123456789"
        evidence = TrustedProviderEvidenceStore(
            sessions, source_id="fm-gateway-synthetic",
            gateway_secret=gateway_key,
        )
        evidence.record_attested(
            evidence_id="provider-proof-1", receipt=proof,
            gateway_signature=sign_verified_gateway_attestation(
                evidence_id="provider-proof-1",
                source_id="fm-gateway-synthetic",
                receipt=proof, secret=gateway_key,
            ),
        )
        core = FastAPI()
        core.include_router(governed_recovery_router(
            trust=policy, evidence=evidence, ledger=quota,
            transport_key=TRANSPORT_KEY,
        ))
        http = TestClient(core)
        endpoint = "/internal/v1/command/ai/usage/reconcile"
        request = {
            "request_id": "usage-1", "tenant_id": "tenant-a",
            "unit_id": "unit-a", "evidence_id": "provider-proof-1",
            "requests_revision": 2, "tokens_revision": 2,
        }
        auth = {"Authorization": "Bearer " + signed["token"]}
        assert http.post(endpoint, json=request).status_code == 401
        assert http.post(endpoint, json=request, headers=auth).status_code == 401
        assert http.post(endpoint, json=request, headers={
            "X-FM-Recovery-Service-Key": TRANSPORT_KEY,
        }).status_code == 401
        auth["X-FM-Recovery-Service-Key"] = TRANSPORT_KEY
        wrong = dict(request, tenant_id="attacker-tenant")
        assert http.post(endpoint, json=wrong, headers=auth).status_code == 409
        assert http.post(endpoint, json=request, headers=auth).status_code == 204
        snapshot = quota.usage_snapshot(
            tenant_id="tenant-a", unit_id="__tenant__",
            capability="ai.total_tokens", at=now,
        )
        assert (snapshot.reserved_units, snapshot.consumed_units) == (0, 200)
        assert http.post(endpoint, json=request, headers=auth).status_code == 409
        with sessions() as db:
            audits = db.scalars(select(CommandAdminAuditRecord)).all()
            assert len(audits) == 1
            assert audits[0].action == "core.ai.quota.reconcile"

        revoke = invoke(assistant, signed_node_request("revoke_grant"))
        assert revoke.status_code == 200, revoke.text
        raw, headers = reference.signed_request()
        assert assistant.post(
            reference.PATH, content=raw, headers=headers,
        ).status_code == 401
    finally:
        engine.dispose()
