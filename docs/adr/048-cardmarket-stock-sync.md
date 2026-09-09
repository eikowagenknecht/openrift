---
status: proposed
date: 2026-09-09
---

# ADR-048: Cardmarket Stock Sync through the Browser Extension

## Context and Problem Statement

A Cardmarket seller who tracks nothing lists stock by hand: find the product page for the right printing, set condition and language, look up what other sellers ask, submit. When a card sells they remember, or they do not. OpenRift already holds most of what that workflow needs. The Cardmarket product catalogue and price guide arrive unauthenticated from `downloads.s3.cardmarket.com` for game 22, so every mapped printing carries its `idProduct` alongside trend, low and the rolling averages.

The API that would close the loop is shut. Cardmarket's help page states they accept no new applications, existing holders keep theirs, and credentials may not be shared with third-party software. OpenRift cannot hold a seller's credentials or call `/stock` on their behalf, now or later.

How do we keep a seller's Cardmarket stock and their OpenRift collection in agreement without API access?

## Decision Drivers

- No API access exists and none is obtainable. Any design that puts seller credentials inside OpenRift is out.
- OpenRift's catalogue is complete for Riftbound: printings exist in EN, FR, KR and SC, and nothing else is printed. Cardmarket's product data is not complete. It carries duplicate products for one card (Illaoi as 904248 and 904249, Jayce as 903066 and 903067, Seraphine as 904078 and 904080), and 24 of its 1437 products have no variant mapping.
- A Cardmarket article requires a condition. 99030 of 111157 copies have none, and the scanner writes none.
- Volume is tens to low hundreds of articles moving a few times a week. Nothing here is real-time.
- Writes land on a live marketplace. A listing on the wrong product or at the wrong price costs the seller money directly.

## Considered Options

1. **Cardmarket API v2** with per-user OAuth credentials.
2. **Export files** the seller feeds to a partner tool such as TCG PowerTools, or types in by hand.
3. **The browser extension** driving the seller's own Cardmarket session, with identification, diffing and pricing computed server-side.

## Decision Outcome

Chosen option: **the browser extension (option 3)**, because it is the only one that needs no credentials and still removes the two expensive steps from the manual workflow, finding the right product and looking up a price.

Option 1 is unavailable, and reaching for it later would mean holding credentials Cardmarket forbids sharing. Option 2 works today and stays as the degraded path, but it leaves product identification and pricing with the seller, which is where their time goes.

### Consequences

- Good, because no credential leaves either side. `apps/extension` holds no token today and gains none: it reads pages under the seller's own Cardmarket session and hands payloads to an authenticated openrift.app tab.
- Good, because product identification comes from `marketplace_product_variants` instead of from a name read off the page, so listing a promo on the base printing's page stops being possible.
- Good, because the read-only half stands alone. Pulling a seller's stock reports articles in a language Riftbound is not printed in, and articles sitting on a duplicate Cardmarket product, neither of which Cardmarket can tell them.
- Good, because sales detected from the stock delta keep the collection true without upkeep, which is what a tracker needs to survive its second month.
- Bad, because the write path depends on Cardmarket's DOM. They refactored the bulk listing page recently and it will move again.
- Bad, because Cardmarket's terms neither permit nor forbid browser-side automation of your own account, and the exposure sits on an add-on listed under OpenRift's name.
- Bad, because 89% of copies cannot be listed until they carry a condition, so the scan flow has to grow a per-batch default before the write path is worth much.
- Neutral, because bot protection caps reading at one click per page. At this volume that is not a constraint.

### Confirmation

Unit tests cover the resolver from `(idProduct, finish, idLanguage)` to a printing, the diff rules, and the condition gate. A manual test on a seller account settles whether a bulk row submitted against an existing identical article merges into it or creates a second one, and the write path for existing tuples does not ship before that answer. The extension carries a selector schema version and refuses to fill when the bulk page's fingerprint does not match, falling back to the listing sheet.

## Design

### Identity

The key is the OpenRift printing plus condition and the article flags, never the Cardmarket article tuple. Cardmarket products are addresses that resolve to it.

Resolution reads `(idProduct, finish)` to a `marketplace_products` row, then `marketplace_product_variants` to the printings behind it, then picks by the article's `idLanguage`. Language lives on the article rather than the product and is fully present in a stock row, so the step is deterministic. 2517 Cardmarket products map to more than one printing, one per language, which is the mapping working as intended.

The reverse direction is unexercised: no printing currently carries two Cardmarket products, because the duplicates Cardmarket ships are exactly the entries nobody has mapped yet. Keying on the printing makes that case arrive as a sum rather than as two tuples proposing duplicate listings.

### Sync state

One row per (user, printing, condition, altered flag) in Postgres, carrying the last observed Cardmarket quantity, the last synced tradelist quantity, the observed articles as a list of `(amount, price, comment, idArticle)`, and `last_seen_at`.

Both quantities are required. The first is the Cardmarket-side base and the second is the intent-side base. With only the Cardmarket side, a seller who moves one copy into a deck box while another copy sells reads as in sync. `idArticle` is recorded but never used as a key, because Cardmarket reissues it on edit.

There is no `managed` flag. A boolean cannot express three articles OpenRift listed alongside two the seller listed by hand, and a plan built on it would tell them to delete their own work. The surplus of Cardmarket quantity over what OpenRift accounts for is the unmanaged part, and adopting it creates copies.

### The diff

OpenRift compares observed stock against the tradelist and returns a plan grouped by Cardmarket expansion.

- A matched decrement and increment on the same printing and language within one pull is a condition edit on the existing copy, not a sale plus a new listing. For articles OpenRift accounts for, Cardmarket wins on condition and comment.
- A bare decrement is a sale. Cardmarket has already decremented itself, so nothing is written back. The plan names the copy it will remove (no notes, no links, oldest first) and the seller confirms, since a decrement cannot distinguish a sale from a card pulled by hand.
- Copies without a condition never enter a plan. They are reported as needing one.
- Articles that resolve to no printing go to a per-user bucket that persists across pulls, split into "not printed in this language", which is a seller error, and "waiting on catalogue mapping", which is admin work feeding the existing staging flow.

Orders stay out of the first version. Reading them alongside the stock delta double-counts unless an order ledger keyed by order id exists.

### Writes

Adds go through the bulk listing grid, which is set-scoped and takes 100 product rows at a time. The extension fills `idLanguage`, `idCondition`, `amount` and `comments` on the row matched by the product link's href. Quantity changes and delists go through the per-article edit and delete flow on the Stock page, one article at a time. The human submits every page, and nothing auto-submits.

### Prices

The extension leaves `price` empty and renders OpenRift's suggested value beside the field, click-to-apply per row. The suggestion reuses the list's existing `default_price_pref` (`cm_lowest` and the list currency). Repricing is a report, never a write.

### Extension boundary

The read scrapes into `browser.storage.local` as a transport buffer, opens an openrift.app tab, and a content script there hands the payload to the session that is already authenticated. Storage holds nothing durable. The current deep link passes its payload in the query string (`deckImportUrl`), which a few hundred articles overrun, so the sync handoff uses the fragment, which never reaches nginx.

## Pros and Cons of the Options

### Cardmarket API v2

- Good, because `/stock` and `/orders` are the endpoints this feature wants, at 100 articles per call.
- Bad, because access is closed to new applicants, so no user could obtain it.
- Bad, because sharing credentials with third-party software is forbidden, so even a seller who already holds access could not give them to OpenRift.

### Export files

- Good, because it needs no permissions, no DOM coupling and no add-on listing, which makes it the fallback when the bulk page moves.
- Good, because TCG PowerTools is a listed Cardmarket partner, so a seller has a supported consumer for a CSV.
- Bad, because the seller still identifies each product and prices it by hand, which is the work worth removing.
- Bad, because nothing flows back, so the collection goes stale exactly as it does today.
