# Discord Bot

`apps/discord-bot` is a small stateless Discord bot that answers card-name lookups. It supports two entry points:

- **`/card name:<card> [printing:<printing>]`** — slash command with autocomplete over all card names; the optional `printing` option autocompletes the chosen card's printings (default first) for when you want a specific set, variant, or language
- **`[[card name]]`** — inline references in normal messages (up to 3 per message)

Both entry points also accept printing codes (`OGN-202`, `ogn202`, `OGN-202/298`) through the same `squashForSearch` folding as the site's search — a code lookup shows that exact printing instead of the default one.

Both reply with an embed: the card name linking to its OpenRift card page, a compact stat line, the front image of the card's canonical printing, and the latest price per marketplace. Price links go to the marketplace product page and carry the affiliate tag where the marketplace has one (TCGplayer partner redirect, CardTrader share code); when no product mapping exists they fall back to a marketplace search for the card name.

## How it works

The bot has no database access and no exposed ports. It reads everything from the public API over the internal Docker network (`API_INTERNAL_URL`, `http://api:3000` in compose):

- On startup it fetches `GET /api/v1/catalog` and `GET /api/v1/prices` into memory and refreshes both every 30 minutes. Card-name matching runs against this in-memory snapshot using the same `foldForSearch` folding as the site, so apostrophes and typographic punctuation never decide a match.
- Per lookup it fetches `GET /api/v1/prices/marketplace-info` for the card's representative printing to resolve marketplace product ids. A failed lookup degrades to search links, never an error.
- Embed image URLs and card links are built from `SITE_URL`, so prod and preview each link to their own domain.

A failed catalog refresh keeps the previous snapshot. If the catalog can't be fetched at startup (API still booting), the bot retries every 15 seconds before logging in to Discord.

## Discord application setup (one-time)

1. In the [Discord developer portal](https://discord.com/developers/applications), create a **Team** (e.g. "OpenRift") and create the applications under the team, not a personal account. Two applications: one production app and one dev app (used for local dev and, if ever wanted, preview). The dev bot should only be invited to a private test server.
2. On each application's **Bot** tab:
   - Copy the **token** (this becomes `DISCORD_BOT_TOKEN`).
   - Enable the **Message Content intent**. This is required for `[[card name]]` scanning. It is a privileged intent: once the bot is in 75+ servers, Discord requires bot verification to keep it.
3. Invite the bot with both the `bot` and `applications.commands` scopes:

   ```text
   https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=274877991936
   ```

   The permissions value covers View Channels, Send Messages, Send Messages in Threads, Embed Links, and Read Message History.

The `/card` command registers itself globally on every startup — no separate registration step. First-time global registration can take a few minutes to show up in clients.

## Running it

**Local dev** (uses the dev application's token, `DISCORD_BOT_TOKEN` in the root `.env`):

```bash
bun run discord                      # against prod (openrift.app) — embed images render in Discord
bun run --cwd apps/discord-bot dev   # against the local stack
```

`bun run discord` points the bot at the production API and site URLs, which is the right default for testing: Discord's servers fetch embed images by URL, so localhost images never render. The plain `dev` variant defaults `API_INTERNAL_URL` / `SITE_URL` to `http://localhost:3000` / `http://localhost:5173` and needs a running `bun dev:api`; use it when testing local catalog changes.

**Production** (stable VPS instance): the `bot` service in `docker-compose.yml` is gated behind the `bot` compose profile, so instances without it (preview, by default) skip the container entirely. To enable it:

1. Copy the updated `docker-compose.yml` to the instance directory (same scp as initial setup).
2. In the instance's `.env`, set `DISCORD_BOT_TOKEN=<prod app token>` and `COMPOSE_PROFILES=bot`.
3. Run `./deploy.sh` (or `docker compose up -d bot`).

The `openrift-bot` image is built and pushed by the same bake pipeline as api/web/proxy, so preview and release builds always include it; the profile only controls whether it runs.

## Behavior details

- `[[card name]]` replies never ping the message author, and unmatched names are skipped silently (no "not found" noise in channels). If nothing matches, the bot stays quiet.
- `/card` with no match replies ephemerally, so failed lookups don't clutter the channel.
- References per message are capped at 3, deduped case-insensitively.
- Prices shown are for the card's representative printing (first canonical-rank printing with a front image), in each marketplace's own currency (TCGplayer USD, Cardmarket/CardTrader EUR). The `/card printing` option overrides this; it accepts the autocompleted choice, a short code (`OGN-202`), or a public code (`OGN-202/298`), and anything unrecognized quietly falls back to the default printing.
