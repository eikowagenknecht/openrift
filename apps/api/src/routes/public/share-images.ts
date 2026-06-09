import { createApiApp } from "../../openapi.js";
import {
  buildCards,
  renderListImage,
  siteHostFromOrigin,
  topByQuantity,
} from "../../services/list-image.js";
import type { ShareImageCard } from "../../services/share-image.js";
import { renderShareImage } from "../../services/share-image.js";
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

export const publicShareImagesRoute = createApiApp()
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
  });
