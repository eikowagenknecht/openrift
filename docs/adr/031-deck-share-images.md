---
status: accepted
date: 2026-06-26
---

# ADR-031: Server-Rendered Share Images for Decks

## Context and Problem Statement

Decks are shared into the same WhatsApp and Discord channels as lists, but the public deck share route (`/decks/share/<token>`) only set its `og:image` to the Legend card's full art — a single card, and nothing at all for freeform decks with no Legend. ADR-024 already built a server-rendered, edge-cached share-image pipeline for lists and bundles (satori → sharp, version-keyed immutable URL). We want the same "looks like a real post" unfurl for decks, but a deck has structure a list does not: a Legend identity, a rune-domain split, battlefields, a cost curve, and a sideboard. The community decklist tool "Archive" sets the visual bar — a left identity panel plus a labelled grid.

This ADR records how the deck image is rendered, how it is cached, and the one decision that differs materially from ADR-024 (the cache-bust version source).

## Decision Drivers

- Reuse the ADR-024 pipeline and its edge-cache model (header-driven, `purge_everything`-only, content-addressed by `?v=`) rather than standing up anything new.
- A deck must read as a deck at a glance: Legend hero, rune-domain summary, battlefields, the deck as a cost-sorted grid, and a sideboard strip.
- One artifact should serve both the small link-unfurl preview and a high-resolution download/print, without maintaining two layouts.
- No new infrastructure: no headless browser, no per-URL purge.

## Considered Options

- **A. Keep the single-Legend `og:image`.** No work, but no beautification and nothing for freeform decks.
- **B. Reuse the list grid renderer as-is.** A uniform card grid; loses the deck's structure (Legend, runes, battlefields, sideboard).
- **C. A deck-specific layout built from the ADR-024 primitives**, rendered at two resolutions from one element tree.

## Decision Outcome

Chosen option: **C**. The satori hyperscript, font loader, card-art transcoder, and satori → sharp finish are extracted from `share-image.ts` into `share-image-core.ts`; the list renderer and a new `deck-image.ts` both compose them. `renderDeckImage(io, input, scale)` draws the deck-shaped layout and is wired as the `og:image` for `/decks/share/<token>` plus an HQ download in the deck share dialog.

- **Layout.** A title row (deck name · owner handle, format · card count), a left identity panel (Legend hero, rune-domain glyph summary, battlefields), a cost-sorted grid of the champion + main cards (no "+N more" cap — a deck's distinct-card count is bounded, so the whole deck shows), an optional sideboard strip, and a footer with the host and a QR to the deck. Card images already bake in cost/power/name/text, so a tile is just the art plus a quantity badge.
- **One layout, two resolutions.** satori lays out once at the base 1200×630; raster sources (card art, glyphs, QR) are embedded at `display-px × scale` and sharp rasterizes the SVG at `density = 72 × scale`. The `og:image` renders at 1× (1200×630); the download renders at 3× (3600×1890) behind `?size=hq`. Vector text/paths stay crisp; raster sources are crisp because they are embedded at the matching resolution. Source art (`full` variant, ~800px short edge) caps useful detail near 3×.
- **Rune-domain summary.** Runes are grouped by domain and shown as the domain glyph + a count. The glyphs ship as `apps/api/src/assets/glyphs/rune-*.svg` (copied from the web app's public glyphs), loaded and rasterized like the bundled fonts; a missing glyph falls back to a gold dot.
- **QR code.** Generated server-side with `qrcode` (the web app's `qrcode.react` is React-only). Encodes the deck share URL; omitted when no origin is configured.

### Cache-bust version (the one material difference from ADR-024)

The image URL carries `?v=<lists/decks.updated_at epoch>`, immutably cached. ADR-024 needed a database trigger because list-entry mutations reach the rows via FK cascades that bypass the app layer (disposing a copy, completing a trade), so a trigger was the only place that reliably advanced `lists.updated_at`. **Decks have no such path**: deck cards are only ever rewritten through `decks.replaceCards()`, which already bumps `decks.updated_at` in the same transaction. So the deck image reuses `shareImageVersion(deck.updatedAt)` with **no new trigger or migration**.

### Consequences

- Good, because a pasted deck link unfurls with a full visual decklist, and the same renderer yields an HQ download.
- Good, because the deck path is purely additive (new core module + service + one route + a three-line `head()` change) and rides ADR-024's edge cache unchanged.
- Good, because no schema change is required — the version source already advances on every deck edit.
- Bad, because the API image now bundles the rune glyph SVGs and a `qrcode` dependency.
- Bad, because the 3× render is heavy (a 3600×1890 rasterize is multi-second); acceptable for an on-demand, immutably-cached download, not for hot paths.
- Bad, because satori's CSS subset means the deck layout is hand-built and maintained separately from the app's components (same trade-off as ADR-024).

### Confirmation

- API renderer unit tests (`deck-image.test.ts`): a full constructed deck, a freeform deck with no Legend (panel collapses), an empty deck (placeholder), the 3× variant renders at 3600×1890, and the no-QR path — all produce a valid PNG.
- Route unit tests (`share-images.test.ts`): `Content-Type: image/png`, the immutable `Cache-Control`, enriched deck cards passed to the renderer, `size=hq` selects scale 3, and 404 for an unknown/private token.
- Web unit tests for the `deckShareImageUrl` helper (base + `size=hq`).

## More Information

Builds directly on ADR-024 (lists/bundles share images). The HQ download is gated on the deck being shared because the public image route is keyed by share token; an owner-authenticated deck image route (as lists have) could be added later if pre-share download is wanted.
