---
status: proposed
date: 2026-06-09
---

# ADR-024: Server-Rendered Share Images for Lists

## Context and Problem Statement

Trades are coordinated in WhatsApp and Discord groups, not in OpenRift, even though wish lists and trade lists already hold the structured data a trade needs. ADR-018 gave each user a one-paste bundle link (`/users/share/<token>`), and per-list public links (`/lists/share/<token>`) predate it. But a pasted link is a bare URL: nothing visual, nothing that communicates "here are 12 cards I have for trade" at a glance. ADR-018 deliberately shipped no Open Graph image, because the only identity it had to put in a preview was the sharer's Gravatar, which is PII we do not want leaking into third-party link cards.

We want people to drop their lists into a chat as something that looks like a trade post: a card-art image, a clean copy-paste text block, or a link that unfurls with that same image. The artifact should be scannable and pull recipients back to the app, where the actual list (and a "make your own" path) lives.

This ADR records how we render those images and how we cache them. The text block and the share dialog are mechanical; the load-bearing decisions are the rendering pipeline and the generation/caching model.

## Decision Drivers

- A pasted link must unfurl in WhatsApp and Discord with card art. Link-preview crawlers fetch `og:image` server-side and do not run JavaScript, so the preview image has to be server-rendered.
- No headless browser in the production container. The api image is Bun on Alpine; adding Chromium for screenshots is a large, fragile dependency.
- Reuse existing primitives: the public share routes and `share_token`s from ADR-018 already resolve and enrich list data.
- Fit the edge-caching model from ADR-016, which is steered entirely by per-route `Cache-Control` headers and has only a `purge_everything` control (no per-URL or per-tag purge).
- On-brand typography (the site is Inter) and a clean artifact: quantities and thumbnails only, no condition or price.
- No PII in previews. The reason ADR-018 skipped an OG image does not apply to card art.

## Considered Options

- **A. Headless browser screenshot** (Puppeteer / Playwright rendering a real page).
- **B. Client-side rasterization** with `html2canvas-pro`, already a web dependency.
- **C. Server-side `satori` + `sharp`**: satori lays out an element tree to SVG, the existing `sharp` rasterizes SVG to PNG.

## Decision Outcome

Chosen option: **C, server-side `satori` + `sharp`**, generated **on demand** behind a **version-keyed, immutable URL**, and wired as the `og:image` for both `/lists/share/<token>` and `/users/share/<token>`.

C is the only option that feeds the link unfurl (ruling out B, which can only produce a downloadable image the user attaches manually, never the crawler-fetched preview) without standing up a browser in the container (ruling out A). It reuses `sharp`, already in `apps/api` for the card-rehost pipeline (ADR-012 kept it), so the only new dependency is `satori`, which is pure JavaScript and runs under Bun without native bindings.

Reconciling ADR-018: that ADR omitted an OG image to avoid putting a Gravatar into third-party link cards. The share image here is card art, the list name, and the owner's public display name (the same name already shown on the public share page), with no avatar and no email, so the PII objection does not carry over. This ADR adds an OG image to the bundle and per-list share routes; the avatar and email stay out of the rendered image.

### Consequences

- Good, because a pasted share link unfurls with card art in WhatsApp and Discord, which is the whole point of the feature.
- Good, because one render path serves both the downloadable image and the link-preview image, and the text block is a cheap add-on on top.
- Good, because there is no Chromium, no headless-browser lifecycle, and no per-render process spawn. satori runs in-process and deterministically.
- Good, because the image URL is content-addressed by a version key, so Cloudflare's existing header-driven edge cache does the caching and no targeted purge is ever needed. This fits the `purge_everything`-only setup from ADR-016 exactly.
- Bad, because it adds a dependency (`satori`) and a bundled font asset shipped in the api image.
- Bad, because satori speaks a CSS subset (flexbox and inline styles, no Tailwind, no grid), so the layout is hand-built and maintained separately from the app's components.
- Bad, because satori has no system-font or web-font access and no glyph fallback. It renders only the fonts we hand it, so non-Latin card names (CJK) render as tofu unless a fallback font is bundled (see Deferred).
- Bad, because the link-preview image is only as fresh as the platform's own preview cache. We control the bytes; WhatsApp and Discord cache the unfurl keyed to the pasted page URL and re-crawl on their own schedule, so an already-posted message may not reflect later list edits.

## Design Decisions

### Rendering pipeline

`list data -> satori -> SVG string -> sharp(svg).png() -> PNG bytes`. satori does layout and emits vector SVG; `sharp` 0.34.5 (already a dependency) rasterizes it. Canvas is **1200x630**, the Open Graph standard aspect ratio, so previews crop cleanly across platforms. Card thumbnails are preloaded to buffers before the satori call, since satori embeds images from data it is given rather than fetching arbitrary URLs at layout time. Card images are self-hosted (ADR-007), so they are reachable from the api container by direct filesystem read. Thumbnails are stored as WebP, which satori cannot embed, so each is transcoded to PNG with the existing `sharp` before being passed in. Card-kind wish-list entries do not reference a specific printing, so the renderer resolves a representative printing's front image for each (the same notion of a representative printing the card grids use); an entry with no resolvable art falls back to a name-only tile.

The grid is capped at roughly 12 to 15 cards, with a "+N more" tile when the list is longer. This keeps the image legible at preview size and bounds render time (the dominant cost is decoding thumbnails, not satori itself).

### Fonts

satori needs raw font bytes in TTF, OTF, or WOFF (v1); it cannot read the WOFF2 that `@fontsource-variable/inter` ships, and that package is a web dependency not reachable from the api anyway. Static Inter TTFs (the same typeface the site uses) are committed into the api as assets (`apps/api/src/assets/fonts/`): Regular (400) for card names and SemiBold (600) for the header, loaded into buffers once at startup. The Inter OFL license file ships alongside them. The Docker build must copy these assets into the image, and `.dockerignore` must not strip them, or rendering fails at runtime with a missing-font error.

### On-demand generation, version-keyed URL, edge caching

The image is rendered on demand, not pre-generated or stored. Lists are mutable, and an on-demand render always reflects current contents. To keep repeat requests cheap, the URL carries a content version:

```
/lists/share/<token>/image.png?v=<version>
```

The version is `lists.updated_at` expressed as an epoch, on the invariant that **every entry mutation (insert, update, and delete) touches the parent list's `updated_at`**. The parent timestamp is the version precisely because it advances monotonically on every change. A `MAX(list_entries.updated_at)` over surviving rows cannot stand in for it, and removal is the case that rules it out: deleting any entry other than the most recently touched one leaves the max unchanged (so the version never moves and the cached image still shows the removed card), and deleting the most recent one rolls the max back to an earlier timestamp that was already cached with different content. A content-bust key has to advance forward on every change; a max over children does not.

This invariant is enforced by a database trigger (migration `146-touch-list-on-entry-change`): a per-row `AFTER INSERT OR UPDATE OR DELETE ON list_entries` trigger that runs `UPDATE lists SET updated_at = now() WHERE id = COALESCE(NEW.list_id, OLD.list_id)`. A trigger, not an app-layer touch, because the app layer is blind to FK-cascade deletes: disposing a copy cascade-removes its copy-kind tradelist entry (`fk_list_entries_copy ON DELETE CASCADE`), and completing a trade does the same, neither through an explicit `deleteEntry` call, so an app-layer helper would leave those tradelist images stale. The trigger covers every path (explicit edits, bulk operations, trade sync, cascades) atomically. It is per-row rather than statement-level with transition tables so it reliably fires for cascade-induced deletes; a bulk insert touches the parent once per row, acceptable at personal-list scale. As a side benefit it also makes "sort lists by most recently updated" correct, which it was not before.

The response sets `Cache-Control: public, max-age=31536000, immutable`, which is safe because a given `?v=` value never changes its bytes. When the list changes, the SSR-emitted `og:image` URL points at a new version, which is a fresh cache key at the edge; the endpoint renders once and Cloudflare caches the result. Old version URLs age out on their own.

This is the natural fit for ADR-016: the edge is steered by origin headers, the image is a non-HTML response that Cloudflare honors as-is, and there is no per-URL purge to wire up because the URL is content-addressed. Deploys still run `purge_everything`, which harmlessly evicts warm images that re-render on next hit.

If render cost ever shows up under cold-cache bursts, the fallback is a lazy blob cache in R2 (already used for backups) keyed by `<token>-<version>`, serving the stored PNG on a hit and rendering once on a miss. Same self-invalidation via the version key. This is a later optimization, not part of v1.

### Render cost and abuse

The render is satori + sharp on a 1200x630 canvas; the public, unauthenticated endpoint plus the `?v=` cache-buster means a caller can force origin re-renders past the edge cache. Two bounds: per request, the route resolves art and renders at most a fixed number of top-by-quantity entries (the grid only ever shows a dozen tiles), so an oversized list cannot inflate a single render; across requests, abuse is handled at the Cloudflare edge (rate-limiting / bot protection, ADR-016) rather than in-process. An app-level rate limiter or a render-concurrency cap remain available if the edge proves insufficient.

### nginx header hygiene

The image route's `Cache-Control` is set by the Hono route only. nginx must not also set it on this path: ADR-016 documents an incident where app and nginx both set the header, the values comma-joined, and Cloudflare's edge got stuck in `UPDATING`.

### Artifacts and the text block

Three artifacts, all reachable from the existing share dialog:

1. **Image**: the rendered PNG, offered as a download and used as the `og:image`.
2. **Text block**: a copy-paste string, a header line with the list name, card count, and link, then `Nx Card Name` rows. Quantities only, no condition or price, matching the image. Generated by a web lib util with unit tests.
3. **Link**: the existing public share URL, now with a rich preview.

Which list fields appear is a product decision recorded here: **quantity and thumbnail only**. Condition, language, finish, and price are intentionally excluded to keep the artifact scannable; the link is where someone goes for detail.

### Routes

```
GET /lists/share/<token>/image.png    (public, image/png, immutable cache)
GET /users/share/<token>/image.png    (public, image/png, immutable cache)
```

Both reuse the token resolution and entry enrichment the existing public routes already perform. The `og:image` / `twitter:image` wiring lives in the `head()` of `lists_.share.$token.tsx` and the users-share route. The bundle `og:image` version folds in the list count (`<maxUpdatedAt>-<listCount>`) so removing a list from a bundle advances the cache key; the per-entry "a max over survivors misses removals" argument above applies one level up at bundle membership.

### Empty, private, and missing lists

A missing, private, or rotated token returns 404 (no image). An empty but validly shared list renders a branded placeholder image (consistent with ADR-018 treating "valid link, empty cupboard" as a 200, not a 404), so the unfurl still looks intentional rather than broken.

## Will Not Be Built

- **Headless-browser rendering.** No Chromium in the production image.
- **Per-card condition, language, finish, or price in the image.** The artifact stays visual; detail lives behind the link.
- **Avatar / Gravatar in the rendered image or preview.** No avatar and no email in the image or the link card. The image header does show the owner's public display name (already rendered on the public share page) alongside the list name; ADR-018's concern was specifically pulling the Gravatar into third-party previews, which we still do not do.
- **Pre-rendered, eagerly-stored images.** On demand plus version-keyed edge cache, with no regeneration triggers to maintain.

## Deferred / Out of Scope

- **CJK fallback font.** Ship Inter-only first. If shared card names in Japanese, Korean, or Chinese need to render, add a Noto Sans CJK fallback as a second entry in satori's `fonts` array so Latin text stays Inter and only non-Latin glyphs fall through. Bundling a multi-megabyte CJK font waits for a real need.
- **R2 blob cache.** Edge caching by versioned URL should suffice; the R2 lazy cache is the documented fallback if profiling says otherwise.
- **Smart share links** (matchmaking against the viewer's collection, one-tap reply). The brainstorm that produced this feature scoped the link to plain read-only; recipient-side intelligence is a separate decision.
- **Custom image themes or per-list cover art.** One layout in v1.
- **Emoji in list names.** Inter has no emoji coverage and satori is given no emoji fallback, so an emoji in a list name renders as a tofu box (owner display names are already validated to exclude emoji, so only list names are affected). Cosmetic; strip emoji or add an emoji asset if it bites.
- **Per-list-in-bundle preview accuracy.** The nested `/users/share/<token>/lists/<listId>` page reuses the bundle image but versions it off that single list's `updatedAt`, so its unfurl can lag changes to the bundle's other lists. Secondary surface; the canonical bundle and per-list URLs are correctly versioned.

## Confirmation

- API tests: `Content-Type: image/png`; the `Cache-Control: public, max-age=31536000, immutable` header; 404 for unknown, private, or rotated tokens; placeholder for an empty shared list; the bundle renders the anonymous (public-only) projection; card-kind entries resolve representative art. The renderer is exercised directly (satori + sharp produce a valid PNG, including the empty and overflow paths).
- A migration/integration check that the `list_entries` trigger advances the parent `lists.updated_at` on insert, update, explicit delete, and FK-cascade delete (disposing a copy that sits on a copy-kind tradelist), so the `?v=` version busts on every path.
- Web unit tests for the text-block generator (header, count, link, `Nx` rows, no price or condition), the share-image URL/version helpers, and the share-dialog "Post to a chat" controls.
- Manual verification that `/lists/share/<token>` and `/users/share/<token>` unfurl with the card-art image in Discord and WhatsApp, and that the downloaded image matches.
