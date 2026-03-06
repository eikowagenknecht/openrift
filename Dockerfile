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

# Compile the API server into a single self-contained binary
RUN bun build --compile --minify-whitespace --minify-syntax \
    --target bun-linux-x64 --outfile /app/api-server apps/api/src/index.ts

# ─── Stage 2: API (server + migrations + cron) ───────────────────────────────
FROM gcr.io/distroless/base:nonroot AS api

WORKDIR /app
COPY --from=build /app/api-server ./api-server

EXPOSE 3000
CMD ["./api-server"]

# ─── Stage 3: Web (nginx serves the SPA + proxies /api to the api container) ─
FROM nginx:alpine AS web

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/web.conf /etc/nginx/conf.d/web.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.d/90-feature-flags.sh
EXPOSE 8080
