# `litemcp-sdk`

Dependency-light Python 3.11+ client for the LiteMCP Composer control plane and
scoped Streamable HTTP endpoints. It uses only the standard library at runtime.

Session credentials are sent in the `Authorization` header and are never placed
in URLs.

```python
from litemcp import LiteMCPClient

control = LiteMCPClient(
    "http://localhost:8787",
    tenant_id="org_demo",  # explicit local demo mode
)

server = control.create_server(
    {
        "slug": "finance",
        "name": "Finance",
        "description": "Finance MCP server",
        "transport": "streamable-http",
        "endpoint": "https://finance.example.com/mcp",
        "version": "1.0.0",
        "visibility": "private",
        "tags": ["finance"],
        "tools": [],
    }
)
probed = control.probe_server(server["id"])
print(probed["status"])
```

The dependency-free control-plane methods cover server and composition
lifecycles, policy lint/activation, sessions, audit, roles and assignments,
identity providers, approvals, authority freeze state, service principals,
activation events, and portable import/export. Inputs and responses are plain
dictionaries so the package adds no validation or HTTP dependencies.

Approval decisions must echo the concurrency binding from the inbox entry. This
prevents a stale UI or script from approving a modified request.

```python
approval = control.approvals()[0]
control.decide_approval(
    approval["id"],
    decision="approved",
    reason="Reviewed against the finance change ticket.",
    generation=approval["generation"],
    fingerprint=approval["fingerprint"],
)
```

`create_service_principal` returns a secret once. Pass it to
`create_service_principal_session` to receive an `MCPSession`; credentials stay
in the Basic authorization header. Use `initialize`, `list_tools`, and
`call_tool` on that session.
