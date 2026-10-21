"""Production Command Node signer → real Assistant SQLAlchemy security hold."""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
from datetime import UTC
from pathlib import Path

import pytest
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assistant-source" / "tests" / "saas" / "test_license_security_hold.py"
SIGNER = ROOT / "tests" / "f3-command-license-security-hold-envelope.mts"


def test_fm_security_hold_cross_runtime_and_signed_replay_denied(tmp_path):
    from fm_assistant.db import LicenseSecurityHoldAuditORM, TenantLicenseORM
    from fm_assistant.license_security_hold import LicenseSecurityHoldDenied

    spec = importlib.util.spec_from_file_location("assistant_hold_fixture", SOURCE)
    assert spec and spec.loader
    fixture_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture_module)
    fixture = fixture_module.subject.__wrapped__(tmp_path)
    service, sessions = next(fixture)
    try:
        with sessions() as db:
            cutoff = db.get(TenantLicenseORM, "t1").period_ends_at
        if cutoff.tzinfo is None:
            cutoff = cutoff.replace(tzinfo=UTC)
        env = {**os.environ, "FM_TEST_LICENSE_UNTIL": str(int(cutoff.timestamp()))}
        output = subprocess.run(
            ["node", "--experimental-strip-types", str(SIGNER)],
            check=True, cwd=ROOT, capture_output=True, text=True,
            timeout=20, env=env,
        )
        signed = json.loads(output.stdout)
        body = json.loads(signed["body"])
        headers = signed["headers"]
        request = {
            "raw_body": signed["body"].encode(),
            "headers": {
                "key_id": headers["X-FM-Command-Key-ID"],
                "timestamp": headers["X-FM-Command-Timestamp"],
                "nonce": headers["X-FM-Command-Nonce"],
                "signature": headers["X-FM-Command-Signature"],
            },
            **body,
        }
        assert service.suspend(**request) == "suspended"
        with sessions() as db:
            assert db.get(TenantLicenseORM, "t1").status == "suspended"
            audits = db.scalars(select(LicenseSecurityHoldAuditORM)).all()
            assert len(audits) == 1
            assert audits[0].command_request_id == "hold-cross-runtime-1"
        with pytest.raises(LicenseSecurityHoldDenied):
            service.suspend(**request)
    finally:
        try:
            next(fixture)
        except StopIteration:
            pass
