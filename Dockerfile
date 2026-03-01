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

# ─── Stage 2: API server ──────────────────────────────────────────────────────
FROM gcr.io/distroless/base AS api

WORKDIR /app
COPY --from=build /app/api-server ./api-server

EXPOSE 3000
CMD ["./api-server"]

# ─── Stage 3: Web (nginx serves the SPA + proxies /api to the API container) ──
FROM nginx:alpine AS web

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/web.conf /etc/nginx/conf.d/web.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080

# ─── Stage 4: Migrate (one-off container with only what the runner needs) ─────
FROM oven/bun:1-alpine AS migrate

WORKDIR /app

# Copy DB scripts, their deps, and seed data
COPY --from=build /app/packages/shared/src/db ./packages/shared/src/db
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/node_modules/kysely ./node_modules/kysely
COPY --from=build /app/packages/shared/node_modules/kysely-postgres-js ./node_modules/kysely-postgres-js
COPY --from=build /app/data/cards.json /app/data/prices.json ./data/

CMD ["bun", "packages/shared/src/db/migrate.ts"]
