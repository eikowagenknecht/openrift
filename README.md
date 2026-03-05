# OpenRift

A card collection browser for [Riftbound](https://riftbound.leagueoflegends.com/), the League of Legends trading card game. Browse cards with filtering, sorting, and price data.

**Live:** [openrift.app](https://openrift.app) · **Preview:** [preview.openrift.app](https://preview.openrift.app)

## Documentation

- [Architecture](docs/architecture.md) — monorepo structure, packages, infrastructure diagrams
- [Data Layer](docs/data-layer.md) — database schema and API endpoints
- [Development](docs/development.md) — prerequisites, setup, commands
- [Deployment](docs/deployment.md) — VPS setup, Docker Compose, CI/CD
- [Contributing](docs/contributing.md) — code style, conventions, changelog
- [Decisions](docs/decisions/) — architecture decision records (ADRs)

## Tech Stack

- **Monorepo** — Bun + Turborepo
- **Frontend** — React 19, Vite, TypeScript, shadcn/ui (Base UI), Tailwind CSS 4
- **Backend** — Hono, Kysely, PostgreSQL
- **Infrastructure** — Docker Compose, Nginx, Cloudflare
