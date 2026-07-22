"""Standard-library tests for the dependency-light control-plane client."""

from __future__ import annotations

import base64
import json
import unittest
from unittest.mock import patch

from litemcp import LiteMCPClient


class _Response:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self._payload).encode()


class LiteMCPClientTests(unittest.TestCase):
    def test_server_probe_uses_encoded_path_and_drift_body(self) -> None:
        captured = []

        def fake_open(request: object, *, timeout: int) -> _Response:
            captured.append((request, timeout))
            return _Response({"data": {"status": "healthy"}})

        client = LiteMCPClient(
            "https://api.example.test", tenant_id="org_test", api_key="token"
        )
        with patch("litemcp.client.urlopen", fake_open):
            result = client.probe_server("server/finance", accept_drift=True)

        request, timeout = captured[0]
        self.assertEqual(result, {"status": "healthy"})
        self.assertEqual(timeout, 30)
        self.assertEqual(
            request.full_url,
            "https://api.example.test/api/v1/servers/server%2Ffinance/probe",
        )
        self.assertEqual(request.method, "POST")
        self.assertEqual(json.loads(request.data), {"acceptDrift": True})
        self.assertEqual(request.get_header("X-litemcp-tenant"), "org_test")
        self.assertEqual(request.get_header("Authorization"), "Bearer token")

    def test_service_principal_session_overrides_bearer_auth(self) -> None:
        captured = []

        def fake_open(request: object, *, timeout: int) -> _Response:
            captured.append(request)
            return _Response(
                {
                    "data": {
                        "endpoint": "https://api.example.test/mcp/org/company",
                        "token": "session-token",
                    }
                }
            )

        client = LiteMCPClient("https://api.example.test", api_key="management")
        with patch("litemcp.client.urlopen", fake_open):
            session = client.create_service_principal_session(
                {
                    "tenantId": "org_test",
                    "compositionId": "composition_company",
                    "environmentId": "env_production",
                    "approvedClients": ["automation"],
                },
                client_id="sp_123",
                secret="lmcp_sp_secret",
            )

        expected = base64.b64encode(b"sp_123:lmcp_sp_secret").decode()
        self.assertEqual(captured[0].get_header("Authorization"), f"Basic {expected}")
        self.assertEqual(session.token, "session-token")

    def test_approval_decision_sends_concurrency_binding(self) -> None:
        captured = []

        def fake_open(request: object, *, timeout: int) -> _Response:
            captured.append((request, timeout))
            return _Response({"data": {"status": "approved"}})

        client = LiteMCPClient("https://api.example.test")
        with patch("litemcp.client.urlopen", fake_open):
            result = client.decide_approval(
                "approval/finance",
                decision="approved",
                reason="Reviewed against ticket FIN-42.",
                generation=5,
                fingerprint="d" * 64,
            )

        request, timeout = captured[0]
        self.assertEqual(result, {"status": "approved"})
        self.assertEqual(timeout, 30)
        self.assertEqual(
            request.full_url,
            "https://api.example.test/api/v1/approvals/approval%2Ffinance/decision",
        )
        self.assertEqual(request.method, "POST")
        self.assertEqual(
            json.loads(request.data),
            {
                "decision": "approved",
                "reason": "Reviewed against ticket FIN-42.",
                "generation": 5,
                "fingerprint": "d" * 64,
            },
        )


if __name__ == "__main__":
    unittest.main()
