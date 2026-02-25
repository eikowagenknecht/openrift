# Development

## Prerequisites

- [Node.js](https://nodejs.org/) 22.x
- [pnpm](https://pnpm.io/) 10.x
- [Docker](https://www.docker.com/) (for PostgreSQL)

## Getting Started

```bash
# Install dependencies (also installs lefthook git hooks)
pnpm install

# Copy and configure environment
cp .env.example .env

# Start PostgreSQL
docker compose up db -d

# Run database migrations and seed card/price data
pnpm db:migrate
pnpm db:seed

# Start all dev servers
pnpm dev
```

The frontend is available at `http://localhost:5173`. The API runs at `http://localhost:3000`. Vite proxies `/api/*` requests to the API server automatically.

## Running Individual Apps

```bash
pnpm dev:web    # Vite dev server only (apps/web)
pnpm dev:api    # Hono API server only (apps/api)
pnpm dev        # All apps + shared type checking in parallel
```

## Database

PostgreSQL runs in Docker. Data persists in the `pg_data` volume — to wipe it: `docker compose down -v`.

```bash
pnpm db:migrate    # Run pending migrations
pnpm db:rollback   # Roll back the last migration
pnpm db:seed       # Seed sets, cards, and prices from JSON data
```

Migrations and seed data live in `packages/shared/src/db/`. Seed data (JSON files) lives in `data/` (gitignored — private data, not checked in).

## Linting and Formatting

```bash
pnpm lint          # Full lint: build all packages, then oxlint + oxfmt
pnpm lint:oxlint   # Run oxlint with --fix
pnpm lint:oxfmt    # Run oxfmt on apps/ and packages/
```

[Lefthook](https://github.com/evilmartians/lefthook) runs pre-commit hooks automatically: TypeScript type checking, oxlint, ESLint (React Compiler rules), and oxfmt. Commit messages are validated by [commitlint](https://commitlint.js.org/) to enforce [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, etc.).

## Environment Variables

See `.env.example` for all required variables:

| Variable            | Purpose                                | Dev default                                            |
|---------------------|----------------------------------------|--------------------------------------------------------|
| `POSTGRES_DB`       | Database name                          | `openrift`                                             |
| `POSTGRES_USER`     | Database user                          | `openrift`                                             |
| `POSTGRES_PASSWORD` | Database password                      | `password` (change in production)                      |
| `DATABASE_URL`      | Full Postgres connection string        | `postgres://openrift:password@localhost:5432/openrift` |
| `CORS_ORIGIN`       | Allowed CORS origins (comma-separated) | `https://openrift.app,https://beta.openrift.app`       |
