
## Repository map

- `packages/contracts`: portable schemas and public contracts.
- `packages/core`: framework-neutral business logic, policy, lifecycle, and
  composition state.
- `packages/platform-api` and `packages/mcp-gateway`: control-plane HTTP and MCP
  data-plane boundaries.
- `packages/auth`, `packages/storage`, and `packages/adapter-*`: portable seams
  and infrastructure adapters.
- `packages/analytics`: payload-free usage facts, aggregation, and export.
- `packages/sdk-typescript`, `packages/sdk-python`, and `packages/cli`: public
  client surfaces.
- `apps/server`: portable Node composition. Cloudflare imports do not belong
  here or in portable packages.
- `apps/managed-cloud`: public customer-owned Cloudflare reference composition;
  it is not the private operated-service control plane.
- `apps/web`: product site and operator console.
- `deploy`, `scripts`, and `.github/workflows`: packaging, validation, and
  deployment controls.
- `docs`: architecture, security, operations, limitations, evidence, and
  traceability.

Respect package direction: contracts and portable interfaces first, then core,
API/gateway, adapters/compositions, SDK/CLI/UI, and documentation. Avoid deep
imports and keep Cloudflare, MongoDB, and framework details behind their
declared boundaries.
