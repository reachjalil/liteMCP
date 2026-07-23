ARG NODE_IMAGE=node:24-alpine
ARG NGINX_RUNTIME_IMAGE=nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6

FROM ${NODE_IMAGE} AS build

ARG PNPM_VERSION=10.30.2
ARG SIGNUPS_ENABLED=false
WORKDIR /workspace

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json biome.json .npmrc ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @litemcp/web... build

FROM ${NGINX_RUNTIME_IMAGE} AS runtime

USER root
RUN apk upgrade --no-cache

ENV API_UPSTREAM=http://server:8787 \
    NGINX_ENVSUBST_FILTER=API_UPSTREAM

COPY deploy/docker/web.nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build --chown=101:101 /workspace/apps/web/dist/ /usr/share/nginx/html/

USER 101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080/health"]
