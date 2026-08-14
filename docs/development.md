# Development

## Prerequisites

- [Bun](https://bun.sh/) 1.3+
- [Docker](https://www.docker.com/) (for PostgreSQL)

## Getting Started

```bash
# Install dependencies (also installs lefthook git hooks)
bun install

# Copy and configure environment
cp .env.example .env

# Start PostgreSQL
docker compose up db -d

# Run database migrations
bun db:migrate

# Start all dev servers
bun dev
```

The frontend is available at `https://localhost:5173` (TanStack Start dev server with SSR). The certificate is self-signed, so the browser warns once. The API runs at `http://localhost:3000`. Server functions call the API directly at `localhost:3000`. Only `/api/auth/*` is proxied through the dev server (needed for OAuth redirects and cookie setting).

## Running Individual Apps

```bash
bun dev:web    # Vite dev server only (apps/web)
bun dev:api    # Hono API server only (apps/api)
bun dev        # All apps + shared type checking in parallel
bun dev:http   # Same as `bun dev`, but plain http (no self-signed cert)
```

`bun dev` serves the web app over HTTPS with a self-signed certificate, because
the card scanner's camera needs a secure context. It also sends the
cross-origin isolation headers (COOP/COEP) that unlock SharedArrayBuffer for
the scanner's multi-threaded WASM encoder. COEP blocks cross-origin
subresources that don't send CORP/CORS headers, so use `bun dev:http` for flows
that trip over that or over the self-signed cert (curl checks, e2e).

## Database

PostgreSQL runs in Docker. Data persists in a bind mount at `./data/postgres` — to wipe it, stop the container and remove the directory: `docker compose down && rm -rf ./data/postgres`.

```bash
bun db:migrate    # Run pending migrations
bun db:rollback   # Roll back the last migration
bun make-admin -- <email>  # Grant admin role to a user
bun db:dev-passwords       # Set every user's password to 1111 (local DB only)
```

`bun db:dev-passwords` is meant for a database restored from a production dump: it sets one password for every account (`1111`, or a value passed as an argument), gives users who only signed up through Google, Discord, or an email code a password account so they can be signed in as too, and marks every email verified. It refuses to run unless `DATABASE_URL` points at localhost.

API keys authenticate script calls to the API: send the key as an `x-api-key` header and the request runs as the key's owner (same permissions, including admin). Keys are created on the `/admin/api-keys` page and shown once at creation.

Migrations live in `apps/api/src/db/migrations/` and must be registered in that directory's `index.ts` barrel. The `bun db:migrate` / `bun db:rollback` scripts wrap `scripts/run-migrations.ts`.

To open a psql shell against the local database:

```bash
docker exec -it openrift-db-1 psql -U openrift
```

For one-off queries without an interactive shell:

```bash
docker exec openrift-db-1 psql -U openrift -c "SELECT count(*) FROM cards;"
```

## Troubleshooting

**"Failed to load cards" in the browser**

| Cause                         | Fix                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Database not running          | `docker compose up db -d`                                                                                                                       |
| Migrations not applied        | `bun db:migrate`                                                                                                                                |
| Database empty (no card data) | Import the catalog from the admin panel (`/admin`) — there is no CLI seed command. Grant yourself admin with `bun make-admin -- <email>` first. |

## Linting and Formatting

```bash
bun lint          # Full lint: oxlint, then ESLint (React Compiler rules), then oxfmt
bun lint:oxlint   # Run oxlint with --fix
bun lint:oxfmt    # Run oxfmt on apps/ and packages/
```

[Lefthook](https://github.com/evilmartians/lefthook) runs pre-commit hooks automatically: TypeScript type checking, oxlint, ESLint (React Compiler rules), and oxfmt. Commit messages are validated by [commitlint](https://commitlint.js.org/) to enforce [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, etc.).

## Environment Variables

See `.env.example` for all required variables:

| Variable                | Purpose                                | Dev default                                            |
| ----------------------- | -------------------------------------- | ------------------------------------------------------ |
| `POSTGRES_DB`           | Database name                          | `openrift`                                             |
| `POSTGRES_USER`         | Database user                          | `openrift`                                             |
| `POSTGRES_PASSWORD`     | Database password                      | `password` (change in production)                      |
| `DATABASE_URL`          | Full Postgres connection string        | `postgres://openrift:password@localhost:5432/openrift` |
| `DB_PORT`               | Host-side Postgres port                | `5432`                                                 |
| `API_PORT`              | Host-side API port                     | `3001`                                                 |
| `WEB_PORT`              | Host-side web port                     | `8080`                                                 |
| `IMAGE_TAG`             | GHCR image tag                         | `latest`                                               |
| `CRON_TCGPLAYER`        | TCGPlayer price refresh schedule       | _(unset = disabled)_                                   |
| `CRON_CARDMARKET`       | Cardmarket price refresh schedule      | _(unset = disabled)_                                   |
| `CORS_ORIGIN`           | Allowed CORS origins (comma-separated) | `https://openrift.app,https://preview.openrift.app`    |
| `BETTER_AUTH_SECRET`    | Auth secret key                        | _(generate with `openssl rand -base64 32`)_            |
| `BETTER_AUTH_URL`       | Auth base URL                          | `http://localhost:5173`                                |
| `SMTP_HOST`             | SMTP server for email verification     | `smtp.fastmail.com`                                    |
| `SMTP_PORT`             | SMTP port                              | `465`                                                  |
| `SMTP_SECURE`           | Use TLS for SMTP                       | `true`                                                 |
| `SMTP_USER`             | SMTP username                          | —                                                      |
| `SMTP_PASS`             | SMTP password                          | —                                                      |
| `SMTP_FROM`             | Sender address                         | `OpenRift <noreply@openrift.app>`                      |
| `GOOGLE_CLIENT_ID`      | Google OAuth client ID                 | —                                                      |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth client secret             | —                                                      |
| `DISCORD_CLIENT_ID`     | Discord OAuth client ID                | —                                                      |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret            | —                                                      |
