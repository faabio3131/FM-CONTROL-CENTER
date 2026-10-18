"""Command Node implementation -> real Assistant FastAPI ASGI, synthetic only.

This is a cross-runtime request/envelope integration gate. It does NOT prove
production TLS, network ACLs, real credential provisioning, or external Vault.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import select

from fm_assistant.command_bridge_control_models import CommandBridgeControlEventORM
from fm_assistant.core_bridge_models import CoreBridgeGrantORM, CoreBridgeIdentityORM

ROOT = Path(__file__).resolve().parents[1]
ASSISTANT_TEST = ROOT / "assistant-source/tests/saas/test_core_bridge_service.py"
NODE_RUNNER = ROOT / "tests/f3-command-assistant-node-envelope.mts"
STATUS_NODE_RUNNER = ROOT / "tests/f3-command-assistant-node-status-envelope.mts"
STATUS_ENDPOINT = "/internal/v1/command/core-bridge/status"
ENDPOINT = "/internal/v1/command/core-bridge/manage"


@pytest.fixture
def assistant_fixture(tmp_path):
    # Use the real Assistant test app, real SQLAlchemy lifecycle and SQLite
    # repository fixture without copying or replacing its production handlers.
    assert ASSISTANT_TEST.is_file(), "pinned Assistant checkout required"
    spec = importlib.util.spec_from_file_location(
        "f3_assistant_bridge_reference", ASSISTANT_TEST,
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    generator = module.bridge_client.__wrapped__(tmp_path)
    client, sessions = next(generator)
    try:
        yield client, sessions, module
    finally:
        try:
            next(generator)
        except StopIteration:
            pass


def signed_node_request(action: str, organization: str = "fm-company-organization"):
    # The Node process imports the actual Command production signing/client code.
    proc = subprocess.run(
        ["node", "--experimental-strip-types", str(NODE_RUNNER), action, organization],
        check=True,
        capture_output=True,
        text=True,
        cwd=ROOT,
        timeout=20,
    )
    envelope = json.loads(proc.stdout)
    assert envelope["url"] == "https://assistant.example" + ENDPOINT
    assert "synthetic-command-control-signing-key" not in envelope["body"]
    assert "password" not in envelope["body"]
    return envelope


def signed_status_request(action: str, request_id: str):
    proc = subprocess.run(
        [
            "node", "--experimental-strip-types", str(STATUS_NODE_RUNNER),
            action, request_id,
        ],
        check=True, capture_output=True, text=True, cwd=ROOT, timeout=20,
    )
    envelope = json.loads(proc.stdout)
    assert envelope["url"] == "https://assistant.example" + STATUS_ENDPOINT
    assert "password" not in envelope["body"]
    return envelope


def invoke_status(client, envelope):
    return client.post(
        STATUS_ENDPOINT, content=envelope["body"].encode("utf-8"),
        headers=envelope["headers"],
    )


def invoke(client, envelope):
    return client.post(
        ENDPOINT,
        content=envelope["body"].encode("utf-8"),
        headers=envelope["headers"],
    )


def test_real_node_command_contract_and_python_asgi_revocation(assistant_fixture):
    client, sessions, reference = assistant_fixture
    # Fresh synthetic identity: lifecycle must be provision -> grant -> revoke.
    with sessions.begin() as db:
        grant = db.get(reference.CoreBridgeGrantORM, (
            reference.KEY_ID, "tenant-a", "unit-a", "ai.text",
        ))
        assert grant
        db.delete(grant)
        db.flush()
        identity = db.get(reference.CoreBridgeIdentityORM, reference.KEY_ID)
        assert identity
        db.delete(identity)

    # A correctly signed request from an untrusted organization must fail.
    assert invoke(client, signed_node_request("provision", "other-company")).status_code == 401
    # Even one byte of post-signing scope tampering must invalidate the MAC.
    forged = signed_node_request("provision")
    forged_payload = json.loads(forged["body"])
    forged_payload["target_key_id"] = "attacker-core"
    forged["body"] = json.dumps(forged_payload, separators=(",", ":"))
    assert invoke(client, forged).status_code == 401

    provision = signed_node_request("provision")
    response = invoke(client, provision)
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "provisioned"}
    # Replay must not repeat a previously committed mutation.
    assert invoke(client, provision).status_code == 401

    grant = signed_node_request("grant")
    response = invoke(client, grant)
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "granted"}

    core_body, core_headers = reference.signed_request()
    assert client.post(reference.PATH, content=core_body, headers=core_headers).status_code == 200

    revoke = signed_node_request("revoke_grant")
    request_id = json.loads(revoke["body"])["command_request_id"]
    prior = invoke_status(client, signed_status_request("revoke_grant", request_id))
    assert prior.status_code == 200
    assert prior.json() == {"status": "unknown", "outcome": None}
    response = invoke(client, revoke)
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "revoked"}
    reconciled = invoke_status(client, signed_status_request("revoke_grant", request_id))
    assert reconciled.status_code == 200, reconciled.text
    assert reconciled.json() == {"status": "applied", "outcome": "revoked"}
    assert invoke_status(client, revoke).status_code == 401  # wrong signed path
    core_body, core_headers = reference.signed_request()
    assert client.post(reference.PATH, content=core_body, headers=core_headers).status_code == 401

    response = invoke(client, signed_node_request("revoke_identity"))
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "revoked"}
    assert invoke(client, signed_node_request("provision")).status_code == 401

    with sessions() as db:
        identity = db.get(CoreBridgeIdentityORM, reference.KEY_ID)
        assert identity and not identity.active and identity.revoked_at
        grant = db.get(CoreBridgeGrantORM, (
            reference.KEY_ID, "tenant-a", "unit-a", "ai.text",
        ))
        assert grant and not grant.active and grant.revoked_at
        events = db.scalars(select(CommandBridgeControlEventORM)).all()
        successful = [e.outcome for e in events if e.outcome != "denied"]
        assert sorted(successful) == ["granted", "provisioned", "revoked", "revoked"]
        assert len({e.nonce for e in events}) == len(events)
