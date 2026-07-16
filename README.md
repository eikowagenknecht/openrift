<!-- markdownlint-configure-file { "MD013": false, "MD033": { "allowed_elements": ["details", "summary"] } } -->

# OpenRift

_Built with Fury. Maintained with Calm._

An open-source, [actively developed](apps/web/src/CHANGELOG.md) companion app for [Riftbound](https://riftbound.leagueoflegends.com/), League of Legends' trading card game. Track your collection, build decks, trade in your local groups, and more.

Live and free to use at **[openrift.app](https://openrift.app)**, no install required. This repository is the code that runs it.

![OpenRift card browser](docs/assets/screenshot-cardbrowser.webp)

<details>
<summary>More Screenshots</summary>

Deck builder:

![OpenRift deck builder](docs/assets/screenshot-deckbuilder.webp)

Friend group:

![OpenRift group](docs/assets/screenshot-group.webp)

Group collections:

![OpenRift collection](docs/assets/screenshot-group-collections.webp)

Tournament view:

![OpenRift tournament](docs/assets/screenshot-tournament.webp)

</details>

## What it does

- **Comprehensive catalog.** The biggest catalog I know of ([dated comparison](https://openrift.app/help/why-openrift)): almost all English cards and promos, plus many Chinese cards. French isn't in yet, unfortunately.
- **Accurate price tracking.** Daily prices from TCGplayer, Cardmarket, and CardTrader, side by side, with history charts.
- **One card, one place.** Collections map to the real world: a deck box, a binder, a card lent to a friend. Each copy lives in exactly one, so the app always mirrors what's actually on your shelf.
- **Wishlists and tradelists.** Track the cards you want and the spares you'd part with, and share either by link with anyone. Lists can also fill themselves from rules (a playset of every card, every surplus common beyond two playsets) and stay current on their own.
- **Private groups.** Form a small group with friends or your local game store, with collections owned by the whole group, a view into each member's own collections, and trade matching that surfaces who has the cards you're after. My play group runs a shared "bulk box" of spare cards this way: take a card home, mark it in OpenRift, and it moves from the group pool into your own collection. No other Riftbound site does this.
- **Your decks, your rules.** Validate against official and custom formats, or build freeform with no limits at all. Energy curves, deck codes, per-matchup plans, and a list of what you're still missing so you can proxy or buy the rest. Start building without signing in, and share a deck as a link that unfurls into a full visual decklist.
- **A full toolbox.** Pack opener, card designer, tournament tools, and a searchable rules reference are all built in with more to come.
- **Private and open.** Zero third-party trackers, just cookie-free Umami analytics. Open source under AGPL-3.0, with import and export options, so your data is never locked in.

There is plenty more on the public [roadmap](https://openrift.app/roadmap) and I like to get feedback about what would make this app even better for **you**.

## What it doesn't do

Some things are left out on purpose, each for a reason.

- **No ads**, because nobody has ever wished a page had more ads on it. If I ever monetize beyond donations and affiliate links, I promise it'll be in a way I'd be happy with as a user myself. The ideas I have in mind would **add** value rather than take anything away from you.
- **No forums**, because moderation is a full-time job I don't have time for.
- **No AI** deck suggestions, because as good as AI is at some things, deck-building today isn't one of them.

For where OpenRift stands against the alternatives, and what it has today versus what it doesn't, see the [honest comparison](https://openrift.app/help/why-openrift).

## Why

I wanted to track my collection, and nothing I tried fit. I used the existing trackers for months, and each one was missing something I needed. So I built the tool I wanted, and it has grown into the app my play group and I use every day. A good part of the [roadmap](https://openrift.app/roadmap) started as their feature requests.

I know: the world didn't ask for yet another collection tracker. But none of the existing ones are open source, so improving them from the outside wasn't an option. This one is, and it imports from and exports to the formats the other tools use, so you can bring your collection over in minutes, and take it back out just as easily.

If you want to talk about OpenRift there's a [Discord](https://discord.gg/Qb6RcjXq6z).

## For developers

OpenRift is a TypeScript monorepo: a TanStack Start + customized shadcn/ui frontend (`apps/web`), a Hono API on Bun (`apps/api`), and PostgreSQL accessed through Kysely.

- [Architecture](docs/architecture.md) covers the monorepo structure, packages, and infrastructure.
- [Data Layer](docs/data-layer.md) documents the database schema and API endpoints.
- [Development](docs/development.md) lists the prerequisites, setup, and commands.
- [Deployment](docs/deployment.md) walks through VPS setup, Docker Compose, and CI/CD.
- [Contributing](docs/contributing.md) explains code style, conventions, and the changelog.

On the AI question: Claude does some of the typing, because it is way faster at that than I am (and I already have quite some typing experience accumulated over the last 20+ years of software development).

I get the most fun out of building tools that I end up using myself every day. So the app's architecture, unique features, and detailed decisions about UX (that AIs today mostly answer with mediocrity) are all my own. If you think something can be improved, please open an issue or a pull request. I read every one and respond to all of them.

If you open a pull request, please make sure you understand the code you're submitting, since it's held to the same standard as the rest of the codebase.

Also every change has to get past the test suite (unit, integration, and end-to-end) before it lands.

## Contributing card data

To contribute card data rather than code, use the in-app contribute page (sign in and open **Contribute** from the menu) to submit a missing card, a correction, or an image for review.

## Legal

OpenRift is an unofficial fan project, not affiliated with or endorsed by Riot Games. Created under Riot's "Legal Jibber Jabber" policy using assets owned by Riot Games.

## License

[AGPL-3.0](LICENSE)

---

Made by Eiko Wagenknecht. I also build [LootScraper](https://github.com/eikowagenknecht/lootscraper).
