"""Dependency-light LiteMCP Composer client using the Python standard library."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class LiteMCPError(RuntimeError):
    """Raised when the control plane or MCP gateway returns an error."""


def _json_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if body is not None:
        request_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = Request(url, data=data, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(detail)
            message = payload.get("detail") or payload.get("error", {}).get("message")
        except json.JSONDecodeError:
            message = detail
        raise LiteMCPError(message or f"HTTP {error.code}") from error


@dataclass(slots=True)
class LiteMCPClient:
    base_url: str
    tenant_id: str | None = None
    demo_role: str | None = None
    api_key: str | None = None

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.tenant_id:
            headers["X-LiteMCP-Tenant"] = self.tenant_id
        if self.demo_role:
            headers["X-LiteMCP-Role"] = self.demo_role
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _request(
        self, path: str, *, method: str = "GET", body: dict[str, Any] | None = None
    ) -> Any:
        payload = _json_request(
            f"{self.base_url.rstrip('/')}{path}",
            method=method,
            headers=self._headers(),
            body=body,
        )
        if "data" not in payload:
            raise LiteMCPError(payload.get("detail", "Malformed API response"))
        return payload["data"]

    def overview(self) -> dict[str, Any]:
        return self._request("/api/v1/overview")

    def servers(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/servers")

    def compositions(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/compositions")

    def simulate_policy(self, decision_input: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "/api/v1/policy/simulate", method="POST", body=decision_input
        )

    def create_session(self, session_input: dict[str, Any]) -> "MCPSession":
        issued = self._request("/api/v1/sessions", method="POST", body=session_input)
        return MCPSession(endpoint=issued["endpoint"], token=issued["token"])

    def revoke_session(self, session_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/sessions/{quote(session_id, safe='')}/revoke", method="POST"
        )


@dataclass(slots=True)
class MCPSession:
    endpoint: str
    token: str
    _request_id: int = 0

    def request(self, method: str, params: dict[str, Any] | None = None) -> Any:
        self._request_id += 1
        body: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
        }
        if params is not None:
            body["params"] = params
        payload = _json_request(
            self.endpoint,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.token}",
                "MCP-Protocol-Version": "2025-11-25",
            },
            body=body,
        )
        if "error" in payload:
            raise LiteMCPError(payload["error"].get("message", "MCP request failed"))
        return payload["result"]

    def initialize(self) -> dict[str, Any]:
        return self.request(
            "initialize",
            {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "litemcp-sdk-python", "version": "0.1.0"},
            },
        )

    def list_tools(self) -> list[dict[str, Any]]:
        return self.request("tools/list")["tools"]

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return self.request("tools/call", {"name": name, "arguments": arguments})
