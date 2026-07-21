# Web site and console

This Astro application contains both the public product site and the
authenticated management console. It builds to static assets so the same output
can be served by the managed cloud Worker or the self-hosted nginx image.

## Structure

- `src/pages` — public product/docs routes, `/login`, and `/app`.
- `src/components` — reusable Astro presentation components and React islands.
- `src/components/console` — API-backed management console.
- `src/components/auth` — Better Auth password and enterprise SSO entry points.
- `src/lib/api.ts` — typed browser client for the control-plane API.
- `src/styles` — shared, console, and authentication design systems.

## Development

Run the API and website in separate terminals:

```bash
LITEMCP_DEMO_MODE=true pnpm dev:server
PUBLIC_API_ORIGIN=http://localhost:8787 \
LITEMCP_DEMO_MODE=true \
pnpm dev:web
```

Then open `http://localhost:4321`. Demo mode is visibly labeled and is not a
substitute for authentication.

## Validation

```bash
pnpm --filter @litemcp/web check
pnpm --filter @litemcp/web build
```

Keep ordinary content in Astro. Use React only for interactive management or
authentication surfaces, and preserve keyboard, responsive, and reduced-motion
behavior when changing the design system.
