"""B1/F3: one VendeAtendeIA product, three real components, disposable state.

Pins current Assistant/Core candidates via Foundation Gate.  Signed Assistant
license policy is tested with the actual Core quota admission AND its newer
corporate read-only status port. No provider, payment, customer or network live.
"""
from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from fm_assistant.db import (
    Base, PlanLimitORM, PlanVersionORM, TenantLicenseORM, TenantORM, UnitORM,
)
from fm_assistant.plan_policy_manifest import (
    LicensedQuotaManifestService, issue_core_plan_grant,
)
from core.ai_command_quota_readback import (
    PATH as READBACK_PATH, SCHEMA as READBACK_SCHEMA,
    command_core_quota_readback_router, sign_command_quota_readback,
)
from core.ai_control_plane import ControlPlaneBase
from core.ai_plan_usage_guard import PlanUsageGuard
from core.ai_quota_store import QuotaReservations
from core.ai_router import CapabilityIA, SolicitacaoIA
from core.ai_service_contracts import TextMessage, TextRequestContent
from core.ai_signed_plan_authority import SignedAssistantPlanAuthority

PLAN_KEY = b"synthetic-plan-grant-assistant-core-signer-123456789"
COMMAND_KEY = b"synthetic-command-core-quota-readback-signer-123456789"


def _signed_status(client: TestClient, *, tenant="tenant-vende", unit="unit-vende",
                   capability="atendimento_interpretacao"):
    data = {
        "schema": READBACK_SCHEMA, "tenant_id": tenant, "unit_id": unit,
        "capability": capability,
        "issued_at": int(datetime.now(UTC).timestamp()),
        "nonce": secrets.token_urlsafe(24),
    }
    raw = json.dumps(data, separators=(",", ":"), sort_keys=True).encode()
    signature = sign_command_quota_readback(secret=COMMAND_KEY, body=raw)
    return client.post(READBACK_PATH, content=raw, headers={
        "Content-Type": "application/json",
        "X-FM-Command-Quota-Signature": signature,
    })


def test_one_saas_license_and_real_core_quota_readback(tmp_path):
    a = create_engine(f"sqlite:///{tmp_path / 'vende-assistant.db'}")
    c = create_engine(f"sqlite:///{tmp_path / 'vende-core.db'}")
    Base.metadata.create_all(a)
    ControlPlaneBase.metadata.create_all(c)
    assistant_db = sessionmaker(bind=a, expire_on_commit=False)
    core_db = sessionmaker(bind=c, expire_on_commit=False)
    now = datetime.now(UTC).replace(microsecond=0)
    with assistant_db.begin() as db:
        db.add(TenantORM(tenant_id="tenant-vende", slug="tenant-vende",
            display_name="VendeAtendeIA test tenant", status="active",
            created_at=now, updated_at=now))
        db.add(UnitORM(tenant_id="tenant-vende", unit_id="unit-vende",
            display_name="Atendimento", status="active",
            created_at=now, updated_at=now))
        db.add(TenantLicenseORM(
            tenant_id="tenant-vende", plan_code="BASICO", plan_revision=1,
            status="active", period_started_at=now,
            period_ends_at=now + timedelta(days=5),
            trial_started_at=None, trial_ends_at=None,
            created_at=now, updated_at=now,
        ))
        db.add(PlanVersionORM(plan_code="BASICO", revision=1,
            label="Básico", status="published", created_at=now))
        for metric, limit in (("ai.requests", 10), ("ai.total_tokens", 800)):
            db.add(PlanLimitORM(
                plan_code="BASICO", revision=1, resource=metric,
                scope="tenant", limit_units=limit, window_seconds=86400,
            ))

    def fetch_from_assistant(tenant, unit, capability, challenge):
        manifest = LicensedQuotaManifestService(assistant_db).resolve(
            tenant_id=tenant, unit_id=unit, now=datetime.now(UTC),
        )
        return issue_core_plan_grant(
            manifest=manifest, capability=capability,
            input_bound=20, output_bound=20, secret=PLAN_KEY,
            now=datetime.now(UTC), challenge=challenge,
        )

    authority = SignedAssistantPlanAuthority(
        secret=PLAN_KEY, fetch=fetch_from_assistant,
    )
    quota = QuotaReservations(core_db)
    guard = PlanUsageGuard(quota=quota, authority=authority)
    app = FastAPI()
    app.include_router(command_core_quota_readback_router(
        authority=authority, quota=quota, shared_secret=COMMAND_KEY,
    ))
    client = TestClient(app)

    def admission(identifier):
        return guard.admit(request=SolicitacaoIA(
            tenant_id="tenant-vende", unidade_id="unit-vende",
            request_id=identifier, correlation_id=identifier,
            capability=CapabilityIA.ATENDIMENTO_INTERPRETACAO,
            conteudo=TextRequestContent(system_prompt="FM",
                messages=(TextMessage(role="user", content="Olá"),)),
        ), at=datetime.now(UTC))

    try:
        # Historical grants alone cannot make a missing Core projection green.
        no_projection = _signed_status(client)
        assert no_projection.status_code == 409, no_projection.text
        assert no_projection.json()["detail"] == "core_quota_readback.policy_not_projected"

        admission("first-request")
        before = quota.usage_snapshot(
            tenant_id="tenant-vende", unit_id="__tenant__",
            capability="ai.total_tokens", at=datetime.now(UTC),
        )
        assert before.reserved_units == 40
        observed = _signed_status(client)
        assert observed.status_code == 200, observed.text
        result = observed.json()
        assert result["plan_code"] == "BASICO"
        assert result["license_freshly_verified"] is True
        assert result["core_policy_matches_signed_grant"] is True
        assert result["reservation_created"] is False
        assert result["provider_called"] is False
        assert result["case_resolved"] is False
        assert {m["metric"]: m["reserved_units"] for m in result["quota_metrics"]} == {
            "ai.requests": 1, "ai.total_tokens": 40,
        }
        assert _signed_status(client, capability="atendimento_transcricao").status_code == 200
        assert _signed_status(client, tenant="unrelated-tenant").status_code == 409
        assert _signed_status(client, unit="unlicensed-unit").status_code == 409
        after_reads = quota.usage_snapshot(
            tenant_id="tenant-vende", unit_id="__tenant__",
            capability="ai.total_tokens", at=datetime.now(UTC),
        )
        assert after_reads.reserved_units == before.reserved_units

        with assistant_db.begin() as db:
            db.get(TenantLicenseORM, "tenant-vende").status = "suspended"
        assert _signed_status(client).status_code == 409
        after_suspend = quota.usage_snapshot(
            tenant_id="tenant-vende", unit_id="__tenant__",
            capability="ai.total_tokens", at=datetime.now(UTC),
        )
        assert after_suspend.reserved_units == 40

        with assistant_db.begin() as db:
            db.get(TenantLicenseORM, "tenant-vende").status = "active"
        admission("after-resume")
        again = _signed_status(client)
        assert again.status_code == 200, again.text
        assert {
            m["metric"]: m["reserved_units"]
            for m in again.json()["quota_metrics"]
        }["ai.total_tokens"] == 80
    finally:
        c.dispose()
        a.dispose()
