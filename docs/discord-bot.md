# Discord Bot

`apps/discord-bot` is a small stateless Discord bot that answers card-name lookups, unfurls deck codes, and quotes rules. It supports five entry points:

- **`/card name:<card> [printing:<printing>]`** — slash command with autocomplete over all card names; the optional `printing` option autocompletes the chosen card's printings (default first) for when you want a specific set, variant, or language
- **`[[card name]]`** — inline references in normal messages (up to 3 per message, cards and rules combined). Citation-shaped contents (`[[cr 103.1]]`, `[[tr202]]`, bare `[[103.1]]`) resolve as rule references instead of card names and reply with the same embed `/rule` produces; number-shaped content can't collide with card names or printing codes, which start with letters
- **`/deck code:<deck code>`** — decodes a Piltover Archive deck code into a decklist embed: the deck grouped by zone (titled after its Legend), a rendered deck image, and an "Open in OpenRift" link button to `/decks/import?code=…` so anyone can import it in one click
- **`/link code:<code>`** — links the Discord server to a friend group (see "Group tradelists" below). Only registered when `DISCORD_BOT_API_SECRET` is configured, and only usable by members with the Manage Server permission
- **`/rule query:<query>`** — quotes a rule from the core rules (`CR`) or tournament rules (`TR`). One autocompleted input accepts a citation (`CR 103.1`, `tr202`, dots optional: `103.1a`), a game term (`stun`, resolved through the same term anchors the site's rules pages use for auto-linking), or free text (every word must match). Autocomplete entries are labeled `CR 103.2 — <start of the rule text>` and round-trip the bare citation as the value

The card entry points also accept printing codes (`OGN-202`, `ogn202`, `OGN-202/298`) through the same `squashForSearch` folding as the site's search — a code lookup shows that exact printing instead of the default one.

Each `printing` choice reads `public code · set · variant`, where the variant part comes from `formatPrintingVariantLabelParts` in `packages/shared` — the same helper behind the site's printing picker. It names only what tells a printing from its siblings (language, art variant, finish, size, signature, markers), so a standard and a foil print of one card no longer read identically, and typing "foil" narrows the list. The embed footer carries the same label, so the reply says which printing it is showing. Two exceptions to the shared rules: a language is shown for any non-English printing (the bot has no other language cue), and the plain print of a card with several printings is spelled out as "Standard" so it pairs visibly with its labeled siblings.

Card lookups reply with a deliberately compact embed: the card name linking to its OpenRift card page, the front image of the card's canonical printing, the latest price per marketplace, and a **Details** button. The stat line and the card's rules and effect text are not on the embed, because they are printed on the artwork right above them — repeating them made a card lookup fill a screen for nothing. Flavor text is dropped entirely.

Two things stay above the fold, because they are what the artwork cannot tell you: a `🚫 Banned in <format>` line when the card has an active ban, and a `⚠️ Errata (<source>, <month>)` line when the printed text has been corrected and the image is therefore wrong. The substitute-artwork note (below) sits in the same block.

**Details** opens an ephemeral follow-up, so reading it never adds a message to the channel: the stat line, then the text blocks the site's card panel stacks (rules text, then effect text with the might bonus that shares its box), then a ban field naming the reason per format. Errata replace the printed rules and effect text, with a one-line credit naming the source and month, linked when the errata has a source URL (the original printed text stays off the embed — it lives behind a disclosure on the site). The button's `custom_id` carries the card and printing ids, so a click still resolves after a catalog refresh or a bot restart; only a card that left the catalog fails. A reply answering several `[[card name]]` mentions carries one button per card, labelled with the card name, since buttons attach to the message rather than to an individual embed.

Card-text markup is rendered, not shown raw: `[Reaction]` keyword chips become inline code (the closest Discord has to the site's chip; a chip carrying a glyph, like `[Repeat :rb_energy_2:]`, breaks around it, since a code span would print the emoji literally), `_(reminder text)_` stays italic, the `[>]` chip-shape markers are dropped, and `:rb_might:`-style glyphs become the application's custom emojis (see below) or, when those aren't uploaded, plain words like "Might" and "1 energy". A printing without an image of its own borrows the standard printing's artwork (same language, else EN) like the site's card browser, with the differences noted above the image (e.g. "Standard-printing artwork shown (differs: EN, Promo)"). Price links go to the marketplace product page and carry the affiliate tag where the marketplace has one (TCGplayer partner redirect, CardTrader share code); when no product mapping exists they fall back to a marketplace search for the card name.

## Group tradelists

A friend group can link a Discord server to itself, after which card lookups in that server (both `[[name]]` mentions and `/card`) carry an extra "On tradelists in \<group\>" embed field naming the members who offer the card on a tradelist shared with the group, with their copy counts. Under each member a subtext line splits those copies by printing and names the list each one sits on (`OGN-202/298 Standard 1× (Binder) · Alt Art 1× (Trades)`), so an alt art no longer hides inside a card-level total; printings run in the catalog's canonical order, a public code repeated from the previous entry is dropped, and the line caps at five printings. The supply is computed by the same path as the in-app Trades pages (`tradelistHoldersForCard` in `friend-group-matches.ts`), so reserved, loaned, and altered copies are excluded and dynamic trade rules participate. Only display names, per-printing counts, and the names of the shared lists leave the API — no account ids, conditions, notes, or pricing preferences.

Linking is double-consent: a group admin generates a one-time code (15-minute TTL) in the group's Manage page, and someone with Manage Server permission redeems it with `/link code:<code>` in the server. Linking is the group's consent that shared-tradelist contents may be named in that server, list names included — everyone who can read the channel sees the replies, member or not. Unlinking happens on the Manage page. One group per guild; a group can link several servers.

The bot authenticates these privileged reads with `DISCORD_BOT_API_SECRET`, a shared service secret between the API and the bot (see `.env.example`; compose passes it to both containers). When it is unset, the API's `/api/v1/discord-bot/*` endpoints refuse every call, the bot skips the lookups, and `/link` is not registered. There is no per-guild caching in the bot — every card lookup in a guild is one internal API round trip, and any failure just drops the field from the reply.

## How it works

The bot has no database access and no exposed ports. It reads everything from the API over the internal Docker network (`API_INTERNAL_URL`, `http://api:3000` in compose):

- On startup it fetches `GET /api/v1/catalog` and `GET /api/v1/prices` into memory and refreshes both every 30 minutes. Card-name matching runs against this in-memory snapshot using the same `foldForSearch` folding as the site, so apostrophes and typographic punctuation never decide a match.
- The latest core and tournament rules come from `GET /api/v1/rules` into a second cache (`RulesCache`) on the same startup-retry and 30-minute refresh cadence, kept separate so a rules fetch problem never blocks card lookups. There is no server-side rules search; `/rule` queries run against the in-memory snapshot, like the site's client-side rules search.
- Per lookup it fetches `GET /api/v1/prices/marketplace-info` for the card's representative printing to resolve marketplace product ids. A failed lookup degrades to search links, never an error.
- `/deck` decodes the code locally with the shared `parsePiltoverDeckCode` (from `@openrift/shared`, the same parser the site's deck import uses), resolves short codes against the catalog snapshot, and infers zones with the shared `inferZone`. The deck image comes from `POST /api/v1/decks/image` (the public from-cards renderer) and is attached to the reply; a failed render just drops the image, never the reply. Invalid codes get an ephemeral reply, so failed attempts don't clutter the channel.
- Embed image URLs and card links are built from `SITE_URL`, so prod and preview each link to their own domain.
- On login it reads the application's `rb_`-prefixed emojis once and keeps them in memory for card-text rendering. A failed fetch is logged and the text falls back to words.

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

The slash commands register themselves globally on every startup — no separate registration step. First-time global registration can take a few minutes to show up in clients.

### Glyph emojis (one-time per application)

Card text uses glyphs (`:rb_might:`, `:rb_energy_2:`, `:rb_rune_fury:`). The bot renders them as **application-owned emojis**, which work in every server the app is in without uploading anything per guild. Upload them once per application (prod and dev have separate tokens, so run it once with each):

```bash
bun run discord:emojis              # uses DISCORD_BOT_TOKEN from .env
bun run discord:emojis -- --dry-run # render only, no upload — checks the artwork
bun run discord:emojis -- --force   # replace the ones already uploaded
```

The script rasterizes the site's own glyph SVGs (`apps/web/public/images/glyphs`) at 128px and draws one badge per energy cost, then uploads each as `rb_<glyph>`. The two monochrome glyphs (might, exhaust) get a dark outline so they read on both Discord themes. The bot reads the set on startup (`Glyph emojis loaded: N` in the logs); anything missing falls back to plain words, so a skipped upload degrades the text instead of breaking it.

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

- `[[card name]]` replies never ping the message author, and unmatched names are skipped silently (no "not found" noise in channels). If nothing matches, the bot stays quiet. Rule citations in brackets behave the same: `[[cr 999]]` with no matching rule is simply ignored.
- `/card` with no match replies ephemerally, so failed lookups don't clutter the channel.
- References per message are capped at 3, deduped case-insensitively.
- Prices shown are for the card's representative printing (first canonical-rank printing with a front image), in each marketplace's own currency (TCGplayer USD, Cardmarket/CardTrader EUR). The `/card printing` option overrides this; it accepts the autocompleted choice, a short code (`OGN-202`), or a public code (`OGN-202/298`), and anything unrecognized quietly falls back to the default printing.
- `/rule` replies with an embed titled by the citation (`CR 103.2`, or `CR 119 — Game Objects` for a section heading) linking to the rule's anchor on the site's kind-level rules page (`/rules/core#rule-…`, which redirects to the latest version). The description quotes the whole block in full — never truncated prose: an optional context line (the section heading directly above the block plus bare ancestor numbers, e.g. `Game Objects › 120 › 120.1`; omitted when no heading applies), the rule text, and every descendant rule verbatim as a nested markdown list indented by depth (for a heading: the section's rules). `rule N` / `540.4.b` / `CR N` references are linkified (same matching as the site, via the shared `RULE_REFERENCE_REGEX`). When the 4096-char embed budget runs out, sub-rules are dropped whole with a closing `…and N more on OpenRift` line — never cut mid-sentence. The footer names the ruleset and version. A bare number like `103` matches both rulesets, core ranked first; no match replies ephemerally.
