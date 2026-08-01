# ─── Stage 1: Install dependencies & build ────────────────────────────────────
FROM oven/bun:1.3.14 AS build

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace config and package.json files first (layer cache)
COPY bun.lock package.json ./
COPY apps/api/package.json apps/api/
COPY apps/discord-bot/package.json apps/discord-bot/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/e2e/package.json packages/e2e/

# Stub .git so lefthook postinstall doesn't fail (real .git is copied below)
RUN git init
RUN bun install --frozen-lockfile

# Copy source and build.
#
# SENTRY_ORG / SENTRY_PROJECT identify the target project for source-map
# upload (openrift-ssr — see apps/web/vite.config.ts). The auth token is
# mounted as a BuildKit secret so it stays out of image history and can be
# rotated without rebuilding layers. All three are optional: when the auth
# token is absent, the Sentry Vite plugin skips upload and the build still
# succeeds (useful for local `docker build`).
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

COPY . .
# Captured here so the API can stamp X-Build-Id on responses and the browser
# can detect when its bundled __COMMIT_HASH__ no longer matches a redeployed API.
RUN git rev-parse --short HEAD > /app/.build-id
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    bun run build

# ─── Stage 2: API (server + migrations + cron) ───────────────────────────────
# Debian (glibc), not alpine: onnxruntime-node (scan bank) ships glibc-only
# binaries — on musl they fail at load with a missing ld-linux-x86-64.so.2
FROM oven/bun:1.3.14 AS api

# wget for the compose healthcheck (busybox provided it on alpine; debian slim has neither wget nor curl)
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies natively in this stage so native addons (sharp, onnxruntime) get matching binaries
COPY --from=build /app/bun.lock /app/package.json ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/discord-bot/package.json apps/discord-bot/
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/e2e/package.json packages/e2e/
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/src/CHANGELOG.md ./apps/web/src/CHANGELOG.md
COPY --from=build /app/.build-id /app/.build-id
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]

# ─── Stage 3: Web (TanStack Start SSR server) ───────────────────────────────
FROM oven/bun:1.3.14-alpine AS web

WORKDIR /app
COPY --from=build /app/apps/web/.output .output
EXPOSE 3001

CMD ["bun", "run", ".output/server/index.mjs"]

# ─── Stage 4: Discord bot (card lookups over the public API) ────────────────
FROM oven/bun:1.3.14-alpine AS bot

WORKDIR /app

COPY --from=build /app/bun.lock /app/package.json ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/discord-bot/package.json apps/discord-bot/
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/e2e/package.json packages/e2e/
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/discord-bot ./apps/discord-bot
CMD ["bun", "run", "apps/discord-bot/src/index.ts"]

# ─── Stage 5: Proxy (nginx — reverse proxy + static asset serving) ──────────
FROM nginx:1.31.3-alpine AS proxy

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/web.conf /etc/nginx/conf.d/web.conf
# Built client assets (JS/CSS with content hashes) served directly by nginx
COPY --from=build /app/apps/web/.output/public /srv/static
# Maintenance fallback served when the SSR upstream is unreachable. See the
# @maintenance location in web.conf.
COPY nginx/maintenance.html /srv/static/maintenance.html
EXPOSE 8080
