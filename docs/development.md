# Development

## Prerequisites

- [Bun](https://bun.sh/) 1.2+
- [Docker](https://www.docker.com/) (for PostgreSQL)

## Getting Started

```bash
# Install dependencies (also installs lefthook git hooks)
bun install

# Copy and configure environment
cp .env.example .env

# Start PostgreSQL
docker compose up db -d

# Run database migrations and refresh card catalog
bun db:migrate

# Start all dev servers
bun dev
```

The frontend is available at `http://localhost:5173` (TanStack Start dev server with SSR). The API runs at `http://localhost:3000`. Server functions call the API directly at `localhost:3000`. Only `/api/auth/*` is proxied through the dev server (needed for OAuth redirects and cookie setting).

## Running Individual Apps

```bash
bun dev:web    # Vite dev server only (apps/web)
bun dev:api    # Hono API server only (apps/api)
bun dev        # All apps + shared type checking in parallel
```

## Database

PostgreSQL runs in Docker. Data persists in the `pg_data` volume — to wipe it: `docker compose down -v`.

```bash
bun db:migrate    # Run pending migrations
bun db:rollback   # Roll back the last migration
bun make-admin -- <email>  # Grant admin role to a user
```

Migrations live in `packages/shared/src/db/`.

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

| Cause                         | Fix                       |
| ----------------------------- | ------------------------- |
| Database not running          | `docker compose up db -d` |
| Migrations not applied        | `bun db:migrate`          |
| Database empty (no card data) | `bun db:seed`             |

## Linting and Formatting

```bash
bun lint          # Full lint: build all packages, then oxlint + oxfmt
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
| `CRON_ENABLED`          | Enable price refresh cron jobs         | `true`                                                 |
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
