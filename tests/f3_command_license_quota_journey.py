"""End-to-end internal contract: Command signer → Assistant licensed policy → Core.

Separate from provider/network homologation: the actual corporate TypeScript
signer, Assistant SQLAlchemy license domain and Core transacted quota guard
run on disposable test databases, without manufacturing a paid subscription.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.ai_control_plane import ControlPlaneBase
from core.ai_plan_usage_guard import PlanUsageGuard
from core.ai_quota_store import QuotaDenied, QuotaReservations
from core.ai_router import CapabilityIA, SolicitacaoIA
from core.ai_service_contracts import TextMessage, TextRequestContent
from core.ai_signed_plan_authority import SignedAssistantPlanAuthority

from fm_assistant.db import TenantLicenseORM, UnitORM
from fm_assistant.plan_limits import PlanLimitDenied
from fm_assistant.plan_policy_manifest import (
    LicensedQuotaManifestService, issue_core_plan_grant,
)

ROOT = Path(__file__).resolve().parents[1]
ASSISTANT_TEST = ROOT / "assistant-source/tests/saas/test_plan_license_binding.py"
NODE_SIGNER = ROOT / "tests/f3-command-license-bind-envelope.mts"
QUOTA_SECRET = b"synthetic-core-assistant-signing-key-for-internal-tests"


def test_command_binding_reserves_core_quota_and_revocation_fails_closed(tmp_path):
    spec = importlib.util.spec_from_file_location("f3_assistant_license_fixture", ASSISTANT_TEST)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fixture = module.binding.__wrapped__(tmp_path)
    assistant, assistant_sessions = next(fixture)
    engine = create_engine(f"sqlite:///{tmp_path / 'core-quota.db'}")
    ControlPlaneBase.metadata.create_all(engine)
    core_sessions = sessionmaker(bind=engine, expire_on_commit=False)
    quota = QuotaReservations(core_sessions)
    now = datetime.now(UTC)
    try:
        with assistant_sessions.begin() as db:
            db.add(UnitORM(
                tenant_id="tenant-a", unit_id="unit-a",
                display_name="Unit", status="active",
                created_at=now, updated_at=now,
            ))

        output = subprocess.run(
            ["node", "--experimental-strip-types", str(NODE_SIGNER)],
            check=True, cwd=ROOT, capture_output=True, text=True, timeout=20,
        )
        signed = json.loads(output.stdout)
        body = json.loads(signed["body"])
        headers = signed["headers"]
        response = assistant.bind(
            headers={
                "key_id": headers["X-FM-Command-Key-ID"],
                "timestamp": headers["X-FM-Command-Timestamp"],
                "nonce": headers["X-FM-Command-Nonce"],
                "signature": headers["X-FM-Command-Signature"],
            },
            raw_body=signed["body"].encode("utf-8"),
            **body,
        )
        assert response == "bound"
        signed_status = signed["status"]
        status_payload = json.loads(signed_status["body"])
        status_headers = signed_status["headers"]
        assert assistant.binding_status(
            headers={
                "key_id": status_headers["X-FM-Command-Key-ID"],
                "timestamp": status_headers["X-FM-Command-Timestamp"],
                "nonce": status_headers["X-FM-Command-Nonce"],
                "signature": status_headers["X-FM-Command-Signature"],
            },
            raw_body=signed_status["body"].encode("utf-8"),
            **status_payload,
        ) == "bound_confirmed"
        with assistant_sessions() as db:
            active = db.get(TenantLicenseORM, "tenant-a")
            assert active.plan_revision == 1 and active.status == "trial"

        def authenticated_fresh_read(tenant, unit, capability, challenge):
            manifest = LicensedQuotaManifestService(assistant_sessions).resolve(
                tenant_id=tenant, unit_id=unit, now=datetime.now(UTC),
            )
            return issue_core_plan_grant(
                manifest=manifest, capability=capability,
                input_bound=100, output_bound=80, secret=QUOTA_SECRET,
                now=datetime.now(UTC), challenge=challenge,
            )

        guard = PlanUsageGuard(
            quota=quota,
            authority=SignedAssistantPlanAuthority(
                secret=QUOTA_SECRET, fetch=authenticated_fresh_read,
            ),
        )
        def request(identifier):
            return SolicitacaoIA(
                tenant_id="tenant-a", unidade_id="unit-a",
                request_id=identifier, correlation_id=identifier,
                capability=CapabilityIA.ATENDIMENTO_INTERPRETACAO,
                conteudo=TextRequestContent(
                    system_prompt="Safe customer service",
                    messages=(TextMessage(role="user", content="Oi"),),
                ),
            )

        policy = guard.admit(request=request("ai-request-1"), at=datetime.now(UTC))
        assert policy.revision == 1
        state = quota.usage_snapshot(
            tenant_id="tenant-a", unit_id="__tenant__",
            capability="ai.total_tokens", at=datetime.now(UTC),
        )
        assert state.reserved_units == 180
        with pytest.raises(QuotaDenied):
            guard.admit(request=request("ai-request-1"), at=datetime.now(UTC))

        with assistant_sessions.begin() as db:
            db.get(TenantLicenseORM, "tenant-a").status = "suspended"
        with pytest.raises((QuotaDenied, PlanLimitDenied)):
            guard.admit(request=request("ai-request-2"), at=datetime.now(UTC))
        final = quota.usage_snapshot(
            tenant_id="tenant-a", unit_id="__tenant__",
            capability="ai.total_tokens", at=datetime.now(UTC),
        )
        assert final.reserved_units == 180  # prior attempt still accounted
    finally:
        engine.dispose()
        try:
            next(fixture)
        except StopIteration:
            pass
