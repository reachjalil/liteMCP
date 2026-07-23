ARG NODE_IMAGE=node:24-alpine
ARG NODE_RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212

FROM ${NODE_IMAGE} AS build

ARG PNPM_VERSION=10.30.2
WORKDIR /workspace

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json biome.json .npmrc ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @litemcp/server... build
RUN pnpm --filter @litemcp/server deploy --prod --legacy /opt/litemcp

FROM ${NODE_RUNTIME_IMAGE} AS runtime

ENV NODE_ENV=production \
    LITEMCP_DEMO_MODE=false \
    PORT=8787

WORKDIR /app

COPY --from=build --chown=nonroot:nonroot /opt/litemcp/ ./

USER nonroot

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8787/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

CMD ["dist/index.js"]
