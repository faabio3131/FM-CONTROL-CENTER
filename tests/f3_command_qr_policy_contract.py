"""Real Command TypeScript signer → Assistant SQLAlchemy policy receiver, synthetic DB.

This is NOT live HTTPS, tenant provisioning or provider/WhatsApp homologation.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from fm_assistant.db import Base, WhatsAppQRDisplayPolicyORM
from fm_assistant.qr_policy_sync import CommandQrDisplayPolicyService, QrDisplayPolicyDenied

ROOT = Path(__file__).resolve().parents[1]
SIGNER = ROOT / "tests" / "f3-command-qr-policy-envelope.mts"


def test_command_signer_projects_one_monotonic_corporate_qr_revision(tmp_path):
    output = subprocess.run(
        ["node", "--experimental-strip-types", str(SIGNER)],
        check=True, cwd=ROOT, capture_output=True, text=True, timeout=20,
    )
    envelope = json.loads(output.stdout)
    body = json.loads(envelope["body"])
    headers = envelope["headers"]
    engine = create_engine(f"sqlite:///{tmp_path / 'qr-contract.db'}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    service = CommandQrDisplayPolicyService(
        sessions=sessions, key_id="fm-qr-key",
        signing_key="synthetic-corporate-qr-sync-key-of-sufficient-entropy",
        trusted_organization="fm-org",
    )
    request = {
        "raw_body": envelope["body"].encode(),
        "headers": {
            "key_id": headers["X-FM-Command-Key-ID"],
            "timestamp": headers["X-FM-Command-Timestamp"],
            "nonce": headers["X-FM-Command-Nonce"],
            "signature": headers["X-FM-Command-Signature"],
        },
        **body,
    }
    try:
        assert service.read() == (45, 0)
        assert service.apply(**request) == "projected"
        assert service.read() == (30, 3)
        with sessions() as db:
            row = db.get(WhatsAppQRDisplayPolicyORM, "VENDEATENDEIA")
            assert row.actor_id == "fm-owner" and row.organization_id == "fm-org"
        with pytest.raises(QrDisplayPolicyDenied):
            service.apply(**request)  # globally consumed signed request nonce
        assert service.read() == (30, 3)
    finally:
        engine.dispose()
