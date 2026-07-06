---
status: accepted
date: 2026-06-26
---

# ADR-031: Server-Rendered Share Images for Decks

## Context and Problem Statement

Decks are shared into the same WhatsApp and Discord channels as lists, but the public deck share route (`/decks/share/<token>`) only set its `og:image` to the Legend card's full art, a single card, and nothing at all for freeform decks with no Legend. ADR-024 already built a server-rendered, edge-cached share-image pipeline for lists and bundles (satori-rendered SVG → PNG, version-keyed immutable URL). We want the same "looks like a real post" unfurl for decks, but a deck has structure a list does not: a Legend identity, a rune-domain split, battlefields, a cost curve, and a sideboard. The community decklist tool "Archive" sets the visual bar: a left identity panel plus a labelled grid.

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

We build a deck-specific layout from the ADR-024 primitives (option C). The satori hyperscript, font loader, card-art transcoder, and satori → resvg finish are extracted from `share-image.ts` into `share-image-core.ts`. The list renderer and a new `deck-image.ts` both compose them. `renderDeckImage(io, input, scale)` draws the deck-shaped layout and is wired as the `og:image` for `/decks/share/<token>` plus an HQ download in the deck share dialog.

- **Layout.** A title row (deck name · owner handle, format · card count), a left identity panel (Legend hero, rune-domain glyph summary, battlefields), a cost-sorted grid of the champion + main cards (no "+N more" cap, because a deck's distinct-card count is bounded, so the whole deck shows), an optional sideboard strip, and a footer with the host and a QR to the deck. Card images already bake in cost/power/name/text, so a tile is just the art plus a quantity badge.
- **One layout, two resolutions.** satori lays out once at the base 1200×630; raster sources (card art, glyphs, QR) are embedded at `display-px × scale` and resvg rasterizes the SVG at `zoom = scale`. The `og:image` renders at 1× (1200×630); the download renders at 2× (2400×1260) behind `?size=hq`. Vector text/paths stay crisp; raster sources are crisp because they are embedded at the matching resolution. Source art (`full` variant, ~800px short edge) stays sharp through 2×.
- **Rasterizer: resvg, not sharp.** The final SVG → PNG step uses `@resvg/resvg-js`, the rasterizer satori is designed to pair with (as `@vercel/og` does), not sharp's librsvg path. This was load-bearing: measured on the same ~28-tile deck, sharp's rasterize is super-linear and dominates (1× ≈ 2.5s, 2× ≈ 14s, 3× ≈ 45s), while resvg renders the identical SVG in 1× ≈ 0.4s, 2× ≈ 0.8s, 3× ≈ 1.6s, ~17–28× faster. sharp is kept only for the per-tile WebP/SVG → PNG transcoding (`cardArtDataUri`, glyphs); resvg owns the final raster for every share-image surface (lists, bundles, collections, decks). Its Alpine musl prebuilt ships in the lockfile, the same proven path as sharp.
- **Rune-domain summary.** Runes are grouped by domain and shown as the domain glyph + a count. The glyphs ship as `apps/api/src/assets/glyphs/rune-*.svg` (copied from the web app's public glyphs), loaded and rasterized like the bundled fonts; a missing glyph falls back to a gold dot.
- **QR code.** Generated server-side with `qrcode` (the web app's `qrcode.react` is React-only). Encodes the deck share URL; omitted when no origin is configured.

### Cache-bust version (the one material difference from ADR-024)

The image URL carries `?v=<lists/decks.updated_at epoch>`, immutably cached. ADR-024 needed a database trigger because list-entry mutations reach the rows via FK cascades that bypass the app layer (disposing a copy, completing a trade), so a trigger was the only place that reliably advanced `lists.updated_at`. **Decks have no such path**: deck cards are only ever rewritten through `decks.replaceCards()`, which already bumps `decks.updated_at` in the same transaction. So the deck image reuses `shareImageVersion(deck.updatedAt)` with **no new trigger or migration**.

### Consequences

- Good, because a pasted deck link unfurls with a full visual decklist, and the same renderer yields an HQ download.
- Good, because the deck path is purely additive (new core module + service + one route + a three-line `head()` change) and rides ADR-024's edge cache unchanged.
- Good, because no schema change is required: the version source already advances on every deck edit.
- Bad, because the API image now bundles the rune glyph SVGs and a `qrcode` dependency.
- Good, because moving the final raster from sharp(librsvg) to resvg cut render time ~17–28× (2× HQ: ~14s → ~0.8s), which also makes the existing list/bundle/collection images faster for free. HQ is set to 2× (2400×1260) as a file-size/quality default, plenty sharp given the ~800px source art, and ~half the bytes of 3×. With resvg even 3× is now ~1.6s, so a later bump is cheap. Both sizes are immutably edge-cached, so each renders once.
- Bad, because the API image now carries a second native rasterizer (`@resvg/resvg-js`) alongside sharp.
- Bad, because satori's CSS subset means the deck layout is hand-built and maintained separately from the app's components (same trade-off as ADR-024).

### Confirmation

- API renderer unit tests (`deck-image.test.ts`): a full constructed deck, a freeform deck with no Legend (panel collapses), an empty deck (placeholder), the 2× variant renders at 2400×1260, and the no-QR path, all produce a valid PNG.
- Route unit tests (`share-images.test.ts`): `Content-Type: image/png`, the immutable `Cache-Control`, enriched deck cards passed to the renderer, `size=hq` selects scale 2, and 404 for an unknown/private token.
- Web unit tests for the `deckShareImageUrl` helper (base + `size=hq`).

## More Information

Builds directly on ADR-024 (lists/bundles share images). The HQ download is gated on the deck being shared because the public image route is keyed by share token; an owner-authenticated deck image route (as lists have) could be added later if pre-share download is wanted.
