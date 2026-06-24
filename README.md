# OpenRift

An open-source collection tracker and deck builder for [Riftbound](https://riftbound.leagueoflegends.com/), League of Legends' trading card game.

_Built with Fury. Maintained with Calm._

> Built in 2026 and actively developed. See the [changelog](apps/web/src/CHANGELOG.md).

**[openrift.app](https://openrift.app)** · [Help](https://openrift.app/help) · [Roadmap](https://openrift.app/roadmap) · [Card data](https://github.com/openriftapp/openrift-data) · [Discord](https://discord.gg/Qb6RcjXq6z)

![OpenRift card browser](docs/assets/screenshot.webp)

## Why

I wanted to track my collection, and nothing I tried fit. One site was missing cards, another felt slow on mobile and dropped cards mid-edit, a third had every feature but the basics didn't feel solid. And none of them worked well on both desktop and mobile. So naturally, after a full week of patient, rigorous evaluation, I did the only reasonable thing and built a competing product from scratch.

The [honest comparison](https://openrift.app/help/why-openrift) lays out where OpenRift stands next to the alternatives.

## What it does

- **Every card, every printing.** The most complete Riftbound catalog, including Chinese printings and promos (French cards aren't in yet). Daily prices from three marketplaces (TCGplayer, Cardmarket, CardTrader) sit side by side, with history charts.
- **Collections that match real life.** Name a collection after wherever the cards actually sit ("Red Deck Box", "Binder 1", "Lent to Sebastian"), and each copy lives in exactly one of them.
- **Lists, groups, and trades.** Build wishlists and tradelists, share them by link or inside a small private group, and let trade matching show who has the cards you want. No other Riftbound site does this.
- **A deck builder that checks your collection.** Format validation, energy curves, deck codes, and per-matchup deck plans, plus a list of what you're still missing so you can proxy the rest.
- **More than a tracker.** Pack opener, card designer, tournament tools, and a searchable rules reference round things out.
- **Private and open.** Ad-free with zero third-party trackers, just cookie-free Umami analytics. Open source under AGPL-3.0, with CSV and deck-code export so your data is never locked in.

## What it doesn't do

No AI deck suggestions, because not everything needs AI bolted on. No forums or social feed either, because moderation is a full-time job and this is a tool, not a hangout. There's plenty on the [roadmap](https://openrift.app/roadmap) though, including a mobile app with card scanning. The [honest comparison](https://openrift.app/help/why-openrift) spells out what OpenRift has today and what it doesn't.

## For developers

Turborepo monorepo: TanStack Start frontend (`apps/web`), Hono API (`apps/api`), shared types (`packages/shared`), PostgreSQL. Bun, TypeScript end-to-end, Tailwind + shadcn/ui, oxlint + oxfmt.

- [Architecture](docs/architecture.md) — monorepo structure, packages, infrastructure
- [Data Layer](docs/data-layer.md) — database schema and API endpoints
- [Development](docs/development.md) — prerequisites, setup, commands
- [Deployment](docs/deployment.md) — VPS setup, Docker Compose, CI/CD
- [Contributing](docs/contributing.md) — code style, conventions, changelog

Issues and PRs welcome. To contribute card data (not code), see [openrift-data](https://github.com/openriftapp/openrift-data).

## Legal

OpenRift is an unofficial fan project, not affiliated with or endorsed by Riot Games. Created under Riot's "Legal Jibber Jabber" policy using assets owned by Riot Games.

## License

[AGPL-3.0](LICENSE)
