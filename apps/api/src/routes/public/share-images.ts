import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";

import {
  buildDeckImageCards,
  buildDeckImageCardsFromRefs,
  formatLabelFromSlug,
  renderDeckImage,
} from "../../services/deck-image.js";
import {
  buildCards,
  renderListImage,
  siteHostFromOrigin,
  topByQuantity,
} from "../../services/list-image.js";
import type { ShareImageCard } from "../../services/share-image.js";
import { renderShareImage } from "../../services/share-image.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";

/**
 * Public share images (ADR-024). `GET .../image.png` renders the card-grid PNG
 * used as the og:image and the downloadable attachment. These live in a route
 * app without `loadSession` on purpose: crawlers are anonymous and the image is
 * served with a long immutable cache, so it must never vary by viewer (the
 * bundle image always renders the anonymous, public-only projection).
 *
 * The URL carries a `?v=` content version for cache-busting, which the handler
 * ignores — it always renders current state; the version only changes the edge
 * cache key (see ADR-024 / ADR-016).
 */

/** Long immutable cache: the `?v=` version makes each URL content-addressed. */
const IMAGE_CACHE_CONTROL = "public, immutable, max-age=31536000";

/**
 * Per-printing rows resolved for a collection's share image. The grid only
 * draws a dozen tiles, so this just bounds the art lookup; the accurate "+N
 * more" count comes from a separate distinct count, not this slice.
 */
const COLLECTION_SHARE_CARD_CAP = 60;

/** Upper bound on card rows the from-cards render endpoint will accept. */
const MAX_RENDER_CARD_ROWS = 300;

/** Length cap for the free-text strings a render body may carry. Matches the
 * deck contract's name limit; anything longer only inflates satori layout. */
const MAX_RENDER_TEXT_LENGTH = 200;

// The POST render endpoint is anonymous by design (browser-local decks have no
// session, ADR-035), and each call runs the CPU-heavy satori/resvg/sharp
// pipeline. Unlike the GET share images it is neither token-gated nor
// edge-cached, so it gets the same guards as the other anonymous write-ish
// surfaces: a per-IP rate limit and a body cap that rejects oversized payloads
// before JSON parsing. A legitimate 300-card payload is a few tens of KB.
const RENDER_MAX_BODY_BYTES = 256 * 1024;
const RENDERS_PER_MINUTE = 10;

/** Per-IP render throttle. `x-real-ip` is trustworthy because nginx overwrites
 * it from the connection address (see docs/deployment.md). */
const renderRateLimit = rateLimiter<{ Variables: Variables }>({
  windowMs: 60_000,
  limit: RENDERS_PER_MINUTE,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.req.header("x-real-ip") ?? "unknown",
});

const renderBodyLimit = bodyLimit({
  maxSize: RENDER_MAX_BODY_BYTES,
  onError: (c) =>
    c.json({ code: ERROR_CODES.PAYLOAD_TOO_LARGE, message: "Render payload exceeds 256 KB" }, 413),
});

/** @returns A PNG response with the immutable share-image cache headers. */
function pngResponse(png: Buffer): Response {
  return new Response(png, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": IMAGE_CACHE_CONTROL },
  });
}

/**
 * Collapses cards that recur across a bundle's lists into one tile, keeping the
 * first occurrence's quantity (summing across lists would misrepresent "how
 * many of this card" for a mixed wish/trade bundle).
 * @returns Deduplicated cards.
 */
function dedupeCards(cards: readonly ShareImageCard[]): ShareImageCard[] {
  const byKey = new Map<string, ShareImageCard>();
  for (const card of cards) {
    const key = card.imageId ?? `name:${card.cardName}`;
    if (!byKey.has(key)) {
      byKey.set(key, { ...card });
    }
  }
  return [...byKey.values()];
}

export const publicShareImagesRoute = new Hono<{ Variables: Variables }>()
  // ── GET /lists/share/:token/image.png ─────────────────────────────────────
  .get("/lists/share/:token/image.png", async (c) => {
    const { lists, canonicalPrintings } = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const token = c.req.param("token");

    const found = await lists.findByShareToken(token);
    assertFound(found, "Not found");

    const entries = await lists.entriesWithDetailsAnon(found.list.id, found.list.kind);
    const png = await renderListImage(io, {
      ownerName: found.ownerName ?? "Anonymous",
      listName: found.list.name,
      intent: found.list.intent,
      kind: found.list.kind,
      entries,
      siteHost: siteHostFromOrigin(config.corsOrigin),
      canonicalPrintings,
    });

    return pngResponse(png);
  })

  // ── GET /users/share/:token/image.png ─────────────────────────────────────
  .get("/users/share/:token/image.png", async (c) => {
    const { userShares, lists, canonicalPrintings } = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const token = c.req.param("token");

    const owner = await userShares.findOwnerByShareToken(token);
    assertFound(owner, "Not found");

    // Anonymous projection only (viewerUserId = null): the image is public and
    // immutably cached, so it must not depend on who is viewing.
    const summaries = await userShares.listsForOwner(owner.userId, null);
    const entriesPerList = await Promise.all(
      summaries.map((summary) => lists.entriesWithDetailsAnon(summary.list.id, summary.list.kind)),
    );
    const cards = dedupeCards(
      await buildCards(topByQuantity(entriesPerList.flat()), canonicalPrintings),
    );

    const png = await renderShareImage(io, {
      ownerName: owner.displayName ?? "Anonymous",
      title: "Wish & trade lists",
      intentLabel: `${summaries.length} ${summaries.length === 1 ? "list" : "lists"}`,
      unit: { one: "card", many: "cards" },
      cards,
      totalCount: cards.length,
      siteHost: siteHostFromOrigin(config.corsOrigin),
    });

    return pngResponse(png);
  })

  // ── GET /collections/share/:token/image.png ───────────────────────────────
  .get("/collections/share/:token/image.png", async (c) => {
    const { collections, copies } = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const token = c.req.param("token");

    // findByShareToken only resolves public collections, so a private token (or
    // an unknown one) 404s — the image must never leak a non-shared collection.
    const found = await collections.findByShareToken(token);
    assertFound(found, "Not found");

    const { cards, totalDistinct } = await copies.collectionShareImageCards(
      found.collection.id,
      COLLECTION_SHARE_CARD_CAP,
    );

    const png = await renderShareImage(io, {
      ownerName: found.ownerName ?? "Anonymous",
      title: found.collection.name,
      intentLabel: "Collection",
      // Collections are printing-level (one tile per distinct printing).
      unit: { one: "printing", many: "printings" },
      cards,
      totalCount: totalDistinct,
      siteHost: siteHostFromOrigin(config.corsOrigin),
    });

    return pngResponse(png);
  })

  // ── GET /decks/share/:token/image.png ─────────────────────────────────────
  .get("/decks/share/:token/image.png", async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const token = c.req.param("token");

    const found = await repos.decks.findByShareToken(token);
    assertFound(found, "Not found");

    const cards = await buildDeckImageCards(repos, found.deck.id, found.deck.userId);
    // `?size=hq` renders the same layout at 2× for the download; default 1× is
    // the og:image. The first CORS origin is the canonical site origin for the QR.
    // The rasterize cost grows super-linearly with output pixels (see ADR-031),
    // so HQ is capped at 2× — still crisp for screen/print, ~half the render of 3×.
    const scale = c.req.query("size") === "hq" ? 2 : 1;
    const firstOrigin = config.corsOrigin?.split(",")[0]?.trim();
    const shareUrl = firstOrigin ? `${firstOrigin}/decks/share/${token}` : undefined;

    const png = await renderDeckImage(
      io,
      {
        deckName: found.deck.name,
        ownerName: found.ownerName ?? "Anonymous",
        formatLabel: formatLabelFromSlug(found.deck.format),
        cards,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl,
      },
      scale,
    );

    return pngResponse(png);
  })

  // ── POST /decks/image ──────────────────────────────────────────────────────
  // Renders a deck image from posted cards for browser-local decks (ADR-035),
  // which have no server row and no session — saved decks use the owner-auth GET
  // route (`deck-image.ts`) instead. Enriches names/art/energy server-side from
  // the posted card ids, so the client sends only identity, printing, zone, and
  // count. Served `no-store`: the body is the content, there is nothing to cache.
  .post("/decks/image", renderRateLimit, renderBodyLimit, async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");

    const body = (await c.req.json().catch(() => null)) as {
      deckName?: unknown;
      format?: unknown;
      ownerName?: unknown;
      cards?: unknown;
    } | null;
    const rawCards = Array.isArray(body?.cards) ? body.cards : null;
    if (!rawCards || rawCards.length === 0 || rawCards.length > MAX_RENDER_CARD_ROWS) {
      return c.json({ error: "Invalid deck" }, 400);
    }

    const refs = rawCards.map((card: Record<string, unknown>) => ({
      cardId: String(card.cardId),
      preferredPrintingId:
        typeof card.preferredPrintingId === "string" ? card.preferredPrintingId : null,
      quantity: Number(card.quantity) || 1,
      zone: String(card.zone),
    }));

    const scale = c.req.query("size") === "hq" ? 2 : 1;
    const imageCards = await buildDeckImageCardsFromRefs(repos, refs, { skipUnknown: true });
    const png = await renderDeckImage(
      io,
      {
        deckName:
          typeof body?.deckName === "string" && body.deckName
            ? body.deckName.slice(0, MAX_RENDER_TEXT_LENGTH)
            : "Deck",
        ownerName:
          typeof body?.ownerName === "string" && body.ownerName
            ? body.ownerName.slice(0, MAX_RENDER_TEXT_LENGTH)
            : undefined,
        formatLabel: formatLabelFromSlug(
          typeof body?.format === "string"
            ? body.format.slice(0, MAX_RENDER_TEXT_LENGTH)
            : "constructed",
        ),
        cards: imageCards,
        siteHost: siteHostFromOrigin(config.corsOrigin),
      },
      scale,
    );

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
