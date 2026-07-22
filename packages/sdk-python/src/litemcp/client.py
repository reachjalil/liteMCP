"""Dependency-light LiteMCP Composer client using the Python standard library."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
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
        self,
        path: str,
        *,
        method: str = "GET",
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        payload = _json_request(
            f"{self.base_url.rstrip('/')}{path}",
            method=method,
            headers={**self._headers(), **(headers or {})},
            body=body,
        )
        if "data" not in payload:
            raise LiteMCPError(payload.get("detail", "Malformed API response"))
        return payload["data"]

    def overview(self) -> dict[str, Any]:
        return self._request("/api/v1/overview")

    def environments(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/environments")

    def servers(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/servers")

    def create_server(self, server: dict[str, Any]) -> dict[str, Any]:
        return self._request("/api/v1/servers", method="POST", body=server)

    def update_server(
        self, server_id: str, changes: dict[str, Any]
    ) -> dict[str, Any]:
        return self._request(
            f"/api/v1/servers/{quote(server_id, safe='')}",
            method="PATCH",
            body=changes,
        )

    def delete_server(self, server_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/servers/{quote(server_id, safe='')}", method="DELETE"
        )

    def probe_server(
        self, server_id: str, *, accept_drift: bool = False
    ) -> dict[str, Any]:
        return self._request(
            f"/api/v1/servers/{quote(server_id, safe='')}/probe",
            method="POST",
            body={"acceptDrift": accept_drift},
        )

    def compositions(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/compositions")

    def create_composition(self, composition: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "/api/v1/compositions", method="POST", body=composition
        )

    def update_composition(
        self, composition_id: str, changes: dict[str, Any]
    ) -> dict[str, Any]:
        return self._request(
            f"/api/v1/compositions/{quote(composition_id, safe='')}",
            method="PATCH",
            body=changes,
        )

    def publish_composition(self, composition_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/compositions/{quote(composition_id, safe='')}/publish",
            method="POST",
        )

    def delete_composition(self, composition_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/compositions/{quote(composition_id, safe='')}",
            method="DELETE",
        )

    def policies(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/policies")

    def create_policy(self, policy: dict[str, Any]) -> dict[str, Any]:
        return self._request("/api/v1/policies", method="POST", body=policy)

    def update_policy(
        self, policy_id: str, changes: dict[str, Any]
    ) -> dict[str, Any]:
        return self._request(
            f"/api/v1/policies/{quote(policy_id, safe='')}",
            method="PATCH",
            body=changes,
        )

    def lint_policy(self, policy_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/policies/{quote(policy_id, safe='')}/lint"
        )

    def activate_policy(self, policy_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/policies/{quote(policy_id, safe='')}/activate",
            method="POST",
        )

    def archive_policy(self, policy_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/policies/{quote(policy_id, safe='')}/archive",
            method="POST",
        )

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

    def sessions(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/sessions")

    def audit(self, *, limit: int = 100) -> list[dict[str, Any]]:
        return self._request(f"/api/v1/audit?{urlencode({'limit': limit})}")

    def roles(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/roles")

    def create_role(self, role: dict[str, Any]) -> dict[str, Any]:
        return self._request("/api/v1/roles", method="POST", body=role)

    def update_role(self, role_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            f"/api/v1/roles/{quote(role_id, safe='')}",
            method="PATCH",
            body=changes,
        )

    def delete_role(self, role_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/roles/{quote(role_id, safe='')}", method="DELETE"
        )

    def role_assignments(
        self, *, subject_id: str | None = None
    ) -> list[dict[str, Any]]:
        query = f"?{urlencode({'subjectId': subject_id})}" if subject_id else ""
        return self._request(f"/api/v1/role-assignments{query}")

    def assign_role(self, assignment: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "/api/v1/role-assignments", method="POST", body=assignment
        )

    def remove_role_assignment(self, assignment_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/role-assignments/{quote(assignment_id, safe='')}",
            method="DELETE",
        )

    def identity_providers(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/identity-providers")

    def create_identity_provider(self, provider: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "/api/v1/identity-providers", method="POST", body=provider
        )

    def update_identity_provider(
        self, provider_id: str, changes: dict[str, Any]
    ) -> dict[str, Any]:
        return self._request(
            f"/api/v1/identity-providers/{quote(provider_id, safe='')}",
            method="PATCH",
            body=changes,
        )

    def delete_identity_provider(self, provider_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/identity-providers/{quote(provider_id, safe='')}",
            method="DELETE",
        )

    def approvals(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/approvals")

    def decide_approval(
        self,
        approval_id: str,
        *,
        decision: str,
        reason: str,
        generation: int,
        fingerprint: str,
    ) -> dict[str, Any]:
        return self._request(
            f"/api/v1/approvals/{quote(approval_id, safe='')}/decision",
            method="POST",
            body={
                "decision": decision,
                "reason": reason,
                "generation": generation,
                "fingerprint": fingerprint,
            },
        )

    def authority(self) -> dict[str, Any]:
        return self._request("/api/v1/authority")

    def freeze(self, *, reason: str | None = None) -> dict[str, Any]:
        return self._request(
            "/api/v1/tenant/freeze",
            method="POST",
            body={"reason": reason} if reason else {},
        )

    def unfreeze(self) -> dict[str, Any]:
        return self._request("/api/v1/tenant/unfreeze", method="POST")

    def create_service_principal(self, principal: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "/api/v1/service-principals", method="POST", body=principal
        )

    def create_service_principal_session(
        self,
        session_input: dict[str, Any],
        *,
        client_id: str,
        secret: str,
    ) -> "MCPSession":
        credentials = base64.b64encode(f"{client_id}:{secret}".encode()).decode()
        issued = self._request(
            "/api/v1/service-principal-sessions",
            method="POST",
            body=session_input,
            headers={"Authorization": f"Basic {credentials}"},
        )
        return MCPSession(endpoint=issued["endpoint"], token=issued["token"])

    def deprovision_subject(self, subject_id: str) -> dict[str, Any]:
        return self._request(
            f"/api/v1/subjects/{quote(subject_id, safe='')}/deprovision",
            method="POST",
        )

    def activation_events(self) -> list[dict[str, Any]]:
        return self._request("/api/v1/activation-events")

    def export_configuration(self) -> dict[str, Any]:
        return self._request("/api/v1/export")

    def import_configuration(
        self, configuration: dict[str, Any]
    ) -> dict[str, Any]:
        return self._request("/api/v1/import", method="POST", body=configuration)


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
