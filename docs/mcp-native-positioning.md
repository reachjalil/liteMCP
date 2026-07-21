# MCP-native product positioning

Status: product and messaging contract. Implementation evidence remains in
[`../IMPLEMENTATION_STATUS.md`](../IMPLEMENTATION_STATUS.md).

## Category

**LiteMCP Composer is the enterprise MCP composition control plane.**

It is built for platform and security teams that want to replace scattered MCP
client configuration, repeated end-user authorization, and one-off internal
proxies with one governed MCP entry point. MCP is the primary domain model and
operating surface, not a side feature of an LLM gateway, automation platform,
or connector catalog.

## Positioning statement

For enterprises operating many MCP servers across many users and agent clients,
LiteMCP Composer provides one portable, identity-aware composition layer that
preserves protocol fidelity and upstream provenance. Unlike broad platforms
that expose MCP as one integration surface among many, LiteMCP Composer treats
composition, policy, sessions, routing, approvals, compatibility, and audit as
one MCP-native system.

## Product wedge

The initial wedge is narrow and operationally urgent:

1. register existing MCP servers without re-implementing them;
2. compose their capabilities into a versioned graph;
3. resolve names and publish one stable organization endpoint;
4. issue short-lived sessions for exact identities and environments;
5. filter discovery and reauthorize every call with the same policy;
6. preserve the chosen server, version, route, and decision in audit evidence;
7. move the same configuration between managed cloud and Kubernetes.

This replaces per-client MCP sprawl while preserving the boundaries enterprises
need to operate the result safely.

## Depth map

| MCP-native plane | Required product depth |
| --- | --- |
| Composition | Immutable graphs, pinned upstream versions, namespaces, aliases, collision analysis, schema diff, promotion, rollback |
| Protocol | Negotiation, tools/resources/prompts, streaming, cancellation, progress, errors, resumability, compatibility fixtures |
| Identity | Workforce/workload subjects, organization memberships, groups/claims, scoped sessions, revocation epochs, client binding |
| Authorization | Identical discovery/invocation semantics, default deny, risk classes, approvals, quotas, emergency deny |
| Routing | Health, region/residency, credential eligibility, action semantics, idempotency, safe failover, result ledger |
| Credentials | Per-user/shared connected accounts, vault references, short-lived grants, rotation/revoke, no model/client exposure |
| Evidence | Upstream provenance, policy explanation, correlated audit, metadata-first observability, SIEM export |
| Supply | Registry versions, signing/SBOM, compatibility, moderation, revocation, publish/share/fork/install |
| Portability | Open schemas, secret-safe export/import, managed cloud and Kubernetes parity, no mandatory call-home |

## Messaging rules

- Lead with enterprise MCP composition, not generic integrations or “AI
  infrastructure.”
- Demonstrate depth through exact MCP journeys and protocol objects rather than
  long undifferentiated feature lists.
- Contrast categories, not unverified competitors: “MCP-native composition
  control plane” versus “MCP added to a broader gateway.”
- Never claim superiority, connector breadth, compatibility, security,
  availability, or enterprise readiness without named evidence.
- Use **LiteMCP Composer** as the visible product name. Keep `liteMCP`,
  `@litemcp/*`, and `litemcp` only where repository, package, command, or
  machine identifiers require them.

## Product-market-fit signals

Early validation should measure whether target teams:

- currently maintain duplicated MCP configuration across multiple clients;
- repeatedly create OAuth apps or authorization flows for the same upstream;
- are building an internal composition proxy or control plane;
- need identity-specific discovery rather than one shared tool catalog;
- require audit, approval, provenance, residency, or self-hosting before wider
  MCP adoption;
- can replace at least two independent client/upstream configurations with one
  LiteMCP Composer endpoint in a controlled pilot.

The strongest proof is not site traffic. It is a design partner running a real
multi-server composition with identity-scoped access and choosing to keep it in
their development or production path.
