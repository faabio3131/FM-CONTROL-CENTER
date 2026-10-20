"""Isolated Command Node, Assistant uvicorn and Core uvicorn HTTP network gate.

Test traffic stays loopback; no production endpoints or keys. Core uses a
separate disposable PostgreSQL database and Assistant a disposable SQLite DB.
This proves process/network boundaries, not common cross-DB atomicity or TLS.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from core.ai_control_plane import ControlPlaneBase
from core.ai_provider_evidence_store import TrustedProviderEvidenceStore
from core.ai_provider_source_verifier import ProviderSigningPolicy
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from core.ai_quota_store import QuotaRequirement, QuotaReservations

from f3_command_assistant_cross_runtime import signed_node_request

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tests/f3_network_test_server.py"
NODE = ROOT / "tests/f3-command-core-ai-recovery-token.mts"
KEY = b"synthetic-network-gateway-key-32-bytes-12345"


def _port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _ready(port: int, proc: subprocess.Popen) -> None:
    for _ in range(120):
        if proc.poll() is not None:
            raise AssertionError(f"test service failed to start: {proc.returncode}")
        try:
            with httpx.Client(timeout=0.5, trust_env=False) as client:
                if client.get(f"http://127.0.0.1:{port}/openapi.json").status_code == 200:
                    return
        except httpx.TransportError:
            pass
        time.sleep(0.1)
    raise AssertionError("loopback service not ready")


@pytest.mark.skipif(not os.getenv("F3_THREE_PROCESS_NETWORK_GATE"), reason="isolated CI only")
def test_command_assistant_core_separate_processes_postgres_recovery(tmp_path):
    # Use a dedicated PostgreSQL DATABASE, never FMCC's own Command tables.
    db_source = os.environ["DATABASE_URL"]
    if not db_source.startswith("postgresql://") or "127.0.0.1:5432" not in db_source:
        pytest.fail("unsafe isolated PostgreSQL test configuration")
    name = "f3_network_" + uuid4().hex[:12]
    from sqlalchemy.engine import make_url

    source = make_url(db_source).set(drivername="postgresql+psycopg")
    admin_engine = create_engine(source, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    pg_url = source.set(database=name).render_as_string(hide_password=False)
    # Core's database models are schema-complete in this disposable database;
    # separately certified Core PG migration tests validate Alembic upgrades.
    import core.ai_admin_audit  # noqa: F401
    import core.ai_quota_store  # noqa: F401
    import core.ai_provider_evidence_store  # noqa: F401

    engine = create_engine(pg_url)
    ControlPlaneBase.metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False)
    node = subprocess.run(
        ["node", "--experimental-strip-types", str(NODE)],
        cwd=ROOT, capture_output=True, text=True, check=True, timeout=20,
    )
    signed = json.loads(node.stdout)
    now = datetime.now(UTC)
    ledger = QuotaReservations(sessions)
    ledger.project_signed_grants(
        tenant_id="tenant-a", unit_id="unit-a", revision=5,
        grants=(("ai.requests", "tenant", 12, 3600),
                ("ai.total_tokens", "tenant", 1000, 3600)),
    )
    ledger.reserve_bundle(
        needs=(
            QuotaRequirement(tenant_id="tenant-a", unit_id="__tenant__",
                             capability="ai.requests", units=1, policy_revision=5),
            QuotaRequirement(tenant_id="tenant-a", unit_id="__tenant__",
                             capability="ai.total_tokens", units=400, policy_revision=5),
        ), request_id="usage-network-1", at=now,
    )
    evidence = TrustedProviderEvidenceStore(
        sessions, source_id="fm-gateway-network-ci", gateway_secret=KEY,
    )
    signing_key = Ed25519PrivateKey.generate()
    source_policy = ProviderSigningPolicy(
        issuer="synthetic-provider-signed",
        public_key=signing_key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw,
        ),
    )
    signed_payload = json.dumps({
        "issuer": "synthetic-provider-signed",
        "request_id": "usage-network-1", "tenant_id": "tenant-a",
        "unit_id": "unit-a", "provider": "gemini", "model": "synthetic-model",
        "input_tokens": 140, "output_tokens": 60, "cost_usd": "0.0025",
        "no_charge": False, "observed_at": int(now.timestamp()),
    }, sort_keys=True, separators=(",", ":")).encode()
    assert evidence.record_verified_source(
        evidence_id="provider-proof-network-1",
        provider_payload=signed_payload,
        provider_signature=signing_key.sign(
            b"FM_PROVIDER_USAGE_SOURCE_V1\n" + signed_payload,
        ),
        source_policy=source_policy, expected_request_id="usage-network-1",
        expected_tenant_id="tenant-a", expected_unit_id="unit-a", at=now,
    )
    assistant_port, core_port = _port(), _port()
    env = {
        **os.environ, "F3_NETWORK_TEMP": str(tmp_path),
        "F3_NETWORK_CORE_DB": pg_url,
        "F3_NETWORK_COMMAND_PUB": signed["public_key_pem"],
    }
    ps = []
    try:
        for service, port in (("assistant", assistant_port), ("core", core_port)):
            process = subprocess.Popen(
                [sys.executable, str(SCRIPT), service, str(port)],
                cwd=ROOT, env=env,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            ps.append(process)
            _ready(port, process)
        with httpx.Client(timeout=5, trust_env=False) as http:
            # Real Node Command production HMAC → network → Assistant ASGI.
            provision = signed_node_request("revoke_grant")
            response = http.post(
                f"http://127.0.0.1:{assistant_port}/internal/v1/command/core-bridge/manage",
                content=provision["body"], headers=provision["headers"],
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "revoked"
            assert http.post(
                f"http://127.0.0.1:{assistant_port}/internal/v1/command/core-bridge/manage",
                content=provision["body"], headers=provision["headers"],
            ).status_code == 401

            route = f"http://127.0.0.1:{core_port}/internal/v1/command/ai/usage/reconcile"
            request = {
                "request_id": "usage-network-1", "tenant_id": "tenant-a",
                "unit_id": "unit-a", "evidence_id": "provider-proof-network-1",
                "requests_revision": 5, "tokens_revision": 5,
            }
            assert http.post(route, json=request).status_code == 401
            headers = {"Authorization": "Bearer " + signed["token"]}
            assert http.post(
                route, json=dict(request, tenant_id="foreign"), headers=headers,
            ).status_code == 409
            settled = http.post(route, json=request, headers=headers)
            assert settled.status_code == 204, settled.text
            assert http.post(route, json=request, headers=headers).status_code == 409
        state = ledger.usage_snapshot(
            tenant_id="tenant-a", unit_id="__tenant__",
            capability="ai.total_tokens", at=now,
        )
        assert (state.reserved_units, state.consumed_units) == (0, 200)
    finally:
        for p in ps:
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait(timeout=5)
        engine.dispose()
        with admin_engine.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin_engine.dispose()
