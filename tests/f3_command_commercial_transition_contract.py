"""Real Command Node signer against real Assistant commercial SQL authority.

Entirely disposable; not gateway- or SaaS-production homologation.
"""
from __future__ import annotations

import json
import os
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from fm_assistant.commercial_license_transition import (
    CommercialLicenseTransitionDenied, SignedCommercialLicenseTransition,
)
from fm_assistant.db import (
    Base, CommercialLicenseTransitionAuditORM,
    PlanLimitORM, PlanVersionORM, TenantLicenseORM, TenantORM,
)

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"tests"/"f3-command-commercial-transition-envelope.mts"
KEY="synthetic-command-assistant-commercial-key-for-tests"


def signed(action: str, old: int, target: int) -> dict:
    environ={
        **os.environ,
        "FM_TEST_ACTION":action,
        "FM_TEST_LICENSE_UNTIL":str(old),
        "FM_TEST_TARGET_UNTIL":str(target),
    }
    result=subprocess.run(
        ["node","--experimental-strip-types",str(SOURCE)],
        check=True, cwd=ROOT, text=True, capture_output=True,
        env=environ, timeout=20,
    )
    message=json.loads(result.stdout)
    body=json.loads(message["body"])
    h=message["headers"]
    return {
        "raw_body":message["body"].encode(),
        "headers":{
            "key_id":h["X-FM-Command-Key-ID"],
            "timestamp":h["X-FM-Command-Timestamp"],
            "nonce":h["X-FM-Command-Nonce"],
            "signature":h["X-FM-Command-Signature"],
        },
        **body,
    }


def test_command_assistant_commercial_suspend_and_reactivate_roundtrip(tmp_path):
    engine=create_engine(f"sqlite:///{tmp_path / 'signed-lifecycle.db'}")
    Base.metadata.create_all(engine)
    sessions=sessionmaker(bind=engine,expire_on_commit=False)
    now=datetime.now(UTC).replace(microsecond=0)
    expiry=now+timedelta(days=3)
    with sessions.begin() as db:
        db.add(TenantORM(
            tenant_id="tenant-cross",slug="tenant-cross",display_name="Cross",
            status="active",created_at=now,updated_at=now,
        ))
        db.add(TenantLicenseORM(
            tenant_id="tenant-cross",plan_code="BASE",plan_revision=1,
            status="active",trial_started_at=None,trial_ends_at=None,
            period_started_at=now,period_ends_at=expiry,
            created_at=now,updated_at=now,
        ))
        db.add(PlanVersionORM(
            plan_code="BASE",revision=1,label="Base",status="published",
            created_at=now,
        ))
        for metric in ("ai.requests","ai.total_tokens"):
            db.add(PlanLimitORM(
                plan_code="BASE",revision=1,resource=metric,scope="tenant",
                limit_units=100,window_seconds=86400,
            ))
    service=SignedCommercialLicenseTransition(
        sessions=sessions,key_id="fm-test-key",
        signing_key=KEY,trusted_organization="fm-company",
    )
    try:
        unknown=signed("STATUS",int(expiry.timestamp()),int(expiry.timestamp()))
        assert service.read_status(**unknown)["operation_status"]=="not_applied"
        suspend=signed("SUSPEND_DELINQUENCY",int(expiry.timestamp()),
                       int(expiry.timestamp()))
        assert service.apply(**suspend)=="suspended"
        proof=signed("STATUS",int(expiry.timestamp()),int(expiry.timestamp()))
        state=service.read_status(**proof)
        assert state["operation_status"]=="applied"
        assert state["license_status"]=="suspended"
        assert state["applied_action"]=="SUSPEND_DELINQUENCY"
        assert state["tenant_id"]=="tenant-cross"
        with pytest.raises(CommercialLicenseTransitionDenied):
            service.read_status(**proof)  # read nonce cannot replay
        with pytest.raises(CommercialLicenseTransitionDenied):
            service.apply(**suspend)
        extended=int((now+timedelta(days=31)).timestamp())
        resume=signed("REACTIVATE_VERIFIED",int(expiry.timestamp()),extended)
        assert service.apply(**resume)=="active"
        with sessions() as db:
            row=db.get(TenantLicenseORM,"tenant-cross")
            assert row.status=="active" and row.tenant_id=="tenant-cross"
            assert int(row.period_ends_at.replace(tzinfo=UTC).timestamp())==extended
            audit=db.scalars(select(CommercialLicenseTransitionAuditORM)
                .order_by(CommercialLicenseTransitionAuditORM.applied_at)).all()
            assert {r.action for r in audit}=={
                "SUSPEND_DELINQUENCY","REACTIVATE_VERIFIED",
            }
            assert len(audit)==2
        with pytest.raises(CommercialLicenseTransitionDenied):
            service.apply(**resume)
    finally:
        engine.dispose()
