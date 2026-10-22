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
from core.ai_router import CapabilityIA, ConteudoAudioIA, SolicitacaoIA
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
        def request(identifier, *, tenant_id="tenant-a", unit_id="unit-a"):
            return SolicitacaoIA(
                tenant_id=tenant_id, unidade_id=unit_id,
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

        # The exact same Assistant license MUST govern audio transcription,
        # not just text generation. Both capabilities debit the same
        # tenant-level token budget in Core before any provider attempt.
        audio = SolicitacaoIA(
            tenant_id="tenant-a", unidade_id="unit-a",
            request_id="audio-request-1", correlation_id="audio-request-1",
            capability=CapabilityIA.ATENDIMENTO_TRANSCRICAO,
            conteudo=ConteudoAudioIA(
                audio=b"synthetic-audio-content", mime_type="audio/wav",
                instrucao="Transcreva o audio em portugues",
            ),
        )
        audio_policy = guard.admit(request=audio, at=datetime.now(UTC))
        assert audio_policy.revision == 1
        both = quota.usage_snapshot(
            tenant_id="tenant-a", unit_id="__tenant__",
            capability="ai.total_tokens", at=datetime.now(UTC),
        )
        assert both.reserved_units == 360
        requests_total = quota.usage_snapshot(
            tenant_id="tenant-a", unit_id="__tenant__",
            capability="ai.requests", at=datetime.now(UTC),
        )
        assert requests_total.reserved_units == 2  # text + audio, same plan

        # Neither a foreign tenant nor an unlicensed unit may borrow a
        # previously signed FM license, grant or token reservation.
        for foreign_request in (
            request("foreign-tenant-request", tenant_id="tenant-b"),
            request("foreign-unit-request", unit_id="unit-foreign"),
        ):
            with pytest.raises((QuotaDenied, PlanLimitDenied)):
                guard.admit(request=foreign_request, at=datetime.now(UTC))
        unchanged = quota.usage_snapshot(
            tenant_id="tenant-a", unit_id="__tenant__",
            capability="ai.requests", at=datetime.now(UTC),
        )
        assert unchanged.reserved_units == 2
        with pytest.raises(QuotaDenied):
            guard.admit(request=audio, at=datetime.now(UTC))

        with assistant_sessions.begin() as db:
            db.get(TenantLicenseORM, "tenant-a").status = "suspended"

        # A historical plan bind audit cannot masquerade as current license
        # authorization. Use a FRESH envelope from the real Command signer.
        late = signed["postSuspensionStatus"]
        late_data = json.loads(late["body"])
        late_headers = late["headers"]
        assert late_headers["X-FM-Command-Nonce"] != status_headers["X-FM-Command-Nonce"]
        assert assistant.binding_status(
            headers={
                "key_id": late_headers["X-FM-Command-Key-ID"],
                "timestamp": late_headers["X-FM-Command-Timestamp"],
                "nonce": late_headers["X-FM-Command-Nonce"],
                "signature": late_headers["X-FM-Command-Signature"],
            },
            raw_body=late["body"].encode("utf-8"),
            **late_data,
        ) == "not_confirmed"
        with pytest.raises((QuotaDenied, PlanLimitDenied)):
            guard.admit(request=request("ai-request-2"), at=datetime.now(UTC))
        with pytest.raises((QuotaDenied, PlanLimitDenied)):
            guard.admit(request=SolicitacaoIA(
                tenant_id="tenant-a", unidade_id="unit-a",
                request_id="audio-request-after-revocation",
                correlation_id="audio-request-after-revocation",
                capability=CapabilityIA.ATENDIMENTO_TRANSCRICAO,
                conteudo=ConteudoAudioIA(
                    audio=b"synthetic-audio", mime_type="audio/wav",
                    instrucao="Transcreva",
                ),
            ), at=datetime.now(UTC))
        final = quota.usage_snapshot(
            tenant_id="tenant-a", unit_id="__tenant__",
            capability="ai.total_tokens", at=datetime.now(UTC),
        )
        assert final.reserved_units == 360  # text and audio remain accounted
    finally:
        engine.dispose()
        try:
            next(fixture)
        except StopIteration:
            pass
