import { aspectFromQuery, ERROR_CODES, qrFromQuery } from "@openrift/shared";
import { sentenceCaseSlug } from "@openrift/shared/utils";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { bodyLimit } from "hono/body-limit";

import { AppError } from "../../errors.js";
import { assertFound } from "../../lib/assertions.js";
import { metaDeckImageFraming } from "../../lib/meta-share-image.js";
import { renderCollectionImage } from "../../services/collection-image.js";
import {
  buildDeckImageCards,
  buildDeckImageCardsFromRefs,
  renderDeckImage,
  resolveCoverImageId,
  splitDeckZones,
} from "../../services/deck-image.js";
import {
  buildCards,
  renderListImage,
  shareUrlFromOrigin,
  siteHostFromOrigin,
  topByQuantity,
} from "../../services/list-image.js";
import type { ShareImageCard, ShareImageOptions } from "../../services/share-image.js";
import { renderShareImage } from "../../services/share-image.js";
import { buildTierListImageRows, renderTierListImage } from "../../services/tier-list-image.js";
import type { Variables } from "../../types.js";

/**
 * No `loadSession`: images are cached immutably for anonymous crawlers, so
 * every response must render the public-only projection regardless of viewer.
 * `?v=` is a cache-busting version the handler ignores; it only changes the
 * edge cache key.
 */

/** Long immutable cache: the `?v=` version makes each URL content-addressed. */
const IMAGE_CACHE_CONTROL = "public, immutable, max-age=31536000";

const MAX_RENDER_CARD_ROWS = 300;

/** Matches the deck contract's name limit; anything longer only inflates satori layout. */
const MAX_RENDER_TEXT_LENGTH = 200;

// POST /decks/image is anonymous, uncached, and CPU-heavy, so it gets a per-IP
// rate limit and a body cap that rejects oversized payloads before JSON parsing.
// A legitimate 300-card payload is a few tens of KB.
const RENDER_MAX_BODY_BYTES = 256 * 1024;
const RENDERS_PER_MINUTE = 10;

/** `x-real-ip` is trustworthy because nginx overwrites it from the connection
 * address (see docs/deployment.md). */
const renderRateLimit = rateLimiter<{ Variables: Variables }>({
  windowMs: 60_000,
  limit: RENDERS_PER_MINUTE,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.req.header("x-real-ip") ?? "unknown",
});

// Throwing routes the rejection through `app.onError`, so it answers with the
// same `ApiErrorResponse` envelope as every other error on this route.
const renderBodyLimit = bodyLimit({
  maxSize: RENDER_MAX_BODY_BYTES,
  onError: () => {
    throw new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, "Render payload exceeds 256 KB");
  },
});

/**
 * `?aspect=vertical` selects the 9:16 export, `?qr=0` a plate with no
 * scannable code. An og:image URL never carries either, so the crawler's
 * cached entry is untouched and each variant is its own immutable cache entry.
 */
function imageOptions(aspect: string | undefined, qr: string | undefined): ShareImageOptions {
  return { aspect: aspectFromQuery(aspect), qr: qrFromQuery(qr) };
}

function pngResponse(png: Buffer): Response {
  return new Response(png, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": IMAGE_CACHE_CONTROL },
  });
}

/**
 * Collapses cards that recur across a bundle's lists into one tile, keeping the
 * first occurrence's quantity: summing across lists would misrepresent "how
 * many of this card" for a mixed wish/trade bundle.
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
  .get("/lists/share/:token/image.png", async (c) => {
    const { lists, canonicalPrintings } = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const token = c.req.param("token");

    const found = await lists.findByShareToken(token);
    assertFound(found, "Not found");

    const entries = await lists.entriesWithDetailsAnon(found.list.id, found.list.kind);
    const png = await renderListImage(
      io,
      {
        ownerName: found.ownerName ?? "Anonymous",
        listName: found.list.name,
        intent: found.list.intent,
        kind: found.list.kind,
        entries,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl: shareUrlFromOrigin(config.corsOrigin, `/lists/share/${token}`),
        canonicalPrintings,
      },
      c.req.query("size") === "hq" ? 2 : 1,
      imageOptions(c.req.query("aspect"), c.req.query("qr")),
    );

    return pngResponse(png);
  })

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

    const png = await renderShareImage(
      io,
      {
        ownerName: owner.displayName ?? "Anonymous",
        title: "Wish & trade lists",
        intentLabel: `${summaries.length} ${summaries.length === 1 ? "list" : "lists"}`,
        unit: { one: "card", many: "cards" },
        cards,
        totalCount: cards.length,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl: shareUrlFromOrigin(config.corsOrigin, `/users/share/${token}`),
      },
      c.req.query("size") === "hq" ? 2 : 1,
      imageOptions(c.req.query("aspect"), c.req.query("qr")),
    );

    return pngResponse(png);
  })

  .get("/collections/share/:token/image.png", async (c) => {
    const { collections, copies } = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const token = c.req.param("token");

    // findByShareToken only resolves public collections, so a private token (or
    // an unknown one) 404s — the image must never leak a non-shared collection.
    const found = await collections.findByShareToken(token);
    assertFound(found, "Not found");

    const png = await renderCollectionImage(
      io,
      {
        collectionId: found.collection.id,
        ownerName: found.ownerName ?? "Anonymous",
        collectionName: found.collection.name,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl: shareUrlFromOrigin(config.corsOrigin, `/collections/share/${token}`),
        copies,
      },
      c.req.query("size") === "hq" ? 2 : 1,
      imageOptions(c.req.query("aspect"), c.req.query("qr")),
    );

    return pngResponse(png);
  })

  .get("/decks/share/:token/image.png", async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const token = c.req.param("token");

    const found = await repos.decks.findByShareToken(token);
    assertFound(found, "Not found");

    const [cards, metaContext] = await Promise.all([
      buildDeckImageCards(repos, found.deck.id, found.deck.userId),
      repos.meta.contextForDeck(found.deck.id),
    ]);
    const archive = metaContext
      ? metaDeckImageFraming(metaContext, splitDeckZones(cards).legend?.cardName ?? null)
      : null;

    // HQ is capped at 2x: rasterize cost grows super-linearly with pixels.
    const scale = c.req.query("size") === "hq" ? 2 : 1;
    const aspect = aspectFromQuery(c.req.query("aspect"));
    const path = archive ? `/meta/decks/${token}` : `/decks/share/${token}`;
    const shareUrl = qrFromQuery(c.req.query("qr"))
      ? shareUrlFromOrigin(config.corsOrigin, path)
      : undefined;

    const png = await renderDeckImage(
      io,
      {
        deckName: archive?.deckName ?? found.deck.name,
        ownerName: archive ? archive.ownerName : (found.ownerName ?? "Anonymous"),
        formatLabel: sentenceCaseSlug(found.deck.format),
        resultLine: archive?.resultLine,
        cards,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl,
        coverImageId: await resolveCoverImageId(repos, found.deck),
      },
      scale,
      aspect,
    );

    return pngResponse(png);
  })

  .get("/tier-lists/share/:token/image.png", async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const token = c.req.param("token");

    // findByShareToken requires is_public, so a revoked link 404s here exactly
    // as it does on the share page itself.
    const found = await repos.tierLists.findByShareToken(token);
    assertFound(found, "Not found");

    const rows = await buildTierListImageRows(repos, found.tierList.tiers);
    const scale = c.req.query("size") === "hq" ? 2 : 1;
    const aspect = aspectFromQuery(c.req.query("aspect"));
    const shareUrl = qrFromQuery(c.req.query("qr"))
      ? shareUrlFromOrigin(config.corsOrigin, `/tier-lists/share/${token}`)
      : undefined;

    const png = await renderTierListImage(
      io,
      {
        title: found.tierList.title,
        ownerName: found.ownerName ?? "Anonymous",
        rows,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl,
      },
      scale,
      aspect,
    );

    return pngResponse(png);
  })

  // Browser-local decks have no server row or session; saved decks use the
  // owner-auth GET route (`deck-image.ts`) instead.
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
    const aspect = aspectFromQuery(c.req.query("aspect"));
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
        formatLabel: sentenceCaseSlug(
          typeof body?.format === "string"
            ? body.format.slice(0, MAX_RENDER_TEXT_LENGTH)
            : "constructed",
        ),
        cards: imageCards,
        siteHost: siteHostFromOrigin(config.corsOrigin),
      },
      scale,
      aspect,
    );

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
