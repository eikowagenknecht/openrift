# ─── Stage 1: Install dependencies & build ────────────────────────────────────
FROM oven/bun:1 AS build

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace config and package.json files first (layer cache)
COPY bun.lock package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Stub .git so lefthook postinstall doesn't fail (real .git is copied below)
RUN git init
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# ─── Stage 2: API (server + migrations + cron) ───────────────────────────────
FROM oven/bun:1-alpine AS api

WORKDIR /app

# Install dependencies natively on alpine so native addons (sharp) get musl binaries
COPY --from=build /app/bun.lock /app/package.json ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]

# ─── Stage 3: Web (nginx serves the SPA + proxies /api to the api container) ─
FROM nginx:alpine AS web

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/web.conf /etc/nginx/conf.d/web.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
