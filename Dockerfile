# ─── Stage 1: Install dependencies & build ────────────────────────────────────
FROM node:22-alpine AS build

RUN apk add --no-cache git
RUN corepack enable

WORKDIR /app

# Copy workspace config and package.json files first (layer cache)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Create a production-only deployment for the API
RUN pnpm --filter api deploy /deploy/api --prod

# ─── Stage 2: API server ──────────────────────────────────────────────────────
FROM node:22-alpine AS api

WORKDIR /app

COPY --from=build /deploy/api/node_modules ./node_modules/
COPY --from=build /app/apps/api/dist ./dist/

EXPOSE 3000
CMD ["node", "dist/index.js"]

# ─── Stage 3: Caddy (static frontend + reverse proxy) ─────────────────────────
FROM caddy:2-alpine AS caddy

COPY --from=build /app/apps/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

# ─── Stage 4: Migrate (one-off, runs from the full build image) ───────────────
FROM build AS migrate

WORKDIR /app
CMD ["node", "--import", "tsx", "packages/shared/src/db/migrate.ts"]
