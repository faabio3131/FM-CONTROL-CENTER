"""Process-isolated synthetic ASGI servers for the three-codebase F3 test.

Starts the real pinned Assistant app and a Core recovery app with Postgres.
Only invoked inside disposable CI, never deployed or connected externally.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]


def assistant_app():
    path = ROOT / "assistant-source/tests/saas/test_core_bridge_service.py"
    spec = importlib.util.spec_from_file_location("f3_pinned_assistant_fixture", path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    generator = mod.bridge_client.__wrapped__(Path(os.environ["F3_NETWORK_TEMP"]))
    client, _ = next(generator)
    # Keep the fixture/SQLAlchemy lifecycle alive until this process exits.
    app = client.app
    app.state.f3_test_fixture_generator = generator
    return app


def core_app():
    from core.ai_command_authority import CommandTrustPolicy
    from core.ai_governed_recovery_api import governed_recovery_router
    from core.ai_provider_evidence_store import TrustedProviderEvidenceStore
    from core.ai_quota_store import QuotaReservations

    engine = create_engine(os.environ["F3_NETWORK_CORE_DB"])
    sessions = sessionmaker(engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(governed_recovery_router(
        trust=CommandTrustPolicy(
            issuer="fm-command-synthetic",
            audience="fm-core-ai-recovery",
            public_key_pem=os.environ["F3_NETWORK_COMMAND_PUB"],
        ),
        evidence=TrustedProviderEvidenceStore(
            sessions, source_id="fm-gateway-network-ci",
            gateway_secret=b"synthetic-network-gateway-key-32-bytes-12345",
        ),
        ledger=QuotaReservations(sessions),
        transport_key=os.environ["F3_NETWORK_RECOVERY_SERVICE_KEY"],
    ))
    return app


if __name__ == "__main__":
    port = int(sys.argv[2])
    if not 1024 <= port <= 65535:
        raise ValueError("unsafe test port")
    if sys.argv[1] not in {"assistant", "core"}:
        raise ValueError("unsupported test service")
    app = assistant_app() if sys.argv[1] == "assistant" else core_app()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="error")
