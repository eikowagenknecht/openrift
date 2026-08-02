import { Hono } from "hono";

import { assertFound } from "../../lib/assertions.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  buildDeckImageCards,
  formatLabelFromSlug,
  renderDeckImage,
} from "../../services/deck-image.js";
import { siteHostFromOrigin } from "../../services/list-image.js";
import type { Variables } from "../../types.js";

/**
 * Owner-authenticated download of a deck's share image (ADR-031). The export
 * dialog's "Image" tab uses this so the download works whether or not the deck
 * is publicly shared: the public og:image route resolves by share token, this
 * one resolves the caller's own deck by id. `?size=hq` renders the 2× variant.
 * Owner-only, served `no-store` (the deck is mutable and this is an on-demand,
 * low-traffic download).
 */
export const deckImageRoute = new Hono<{ Variables: Variables }>()
  .basePath("/decks")
  // `requireAuth` is scoped to this one route, not mounted as `.use()` on the
  // whole `/decks` sub-app: a bare `.use(requireAuth)` would 401 anonymous
  // callers of the public `/decks/share/{token}` og:image and encode routes
  // (see list-image.ts for the same hazard on `/lists`). The `/:id/image.png`
  // pattern is two segments deep, so it never collides with the three-segment
  // public `/decks/share/{token}/image.png`.
  .get("/:id/image.png", requireAuth, async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const userId = getUserId(c);
    const id = c.req.param("id");
    const scale = c.req.query("size") === "hq" ? 2 : 1;

    const deck = await repos.decks.getByIdForUser(id, userId);
    assertFound(deck, "Not found");

    const cards = await buildDeckImageCards(repos, deck.id, userId);
    // Only a publicly shared deck has a viewable link, so the QR is dropped for
    // private decks. The first CORS origin is the canonical site origin.
    const firstOrigin = config.corsOrigin?.split(",")[0]?.trim();
    const shareUrl =
      deck.isPublic && deck.shareToken && firstOrigin
        ? `${firstOrigin}/decks/share/${deck.shareToken}`
        : undefined;

    const png = await renderDeckImage(
      io,
      {
        deckName: deck.name,
        ownerName: c.get("user")?.name ?? undefined,
        formatLabel: formatLabelFromSlug(deck.format),
        cards,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl,
      },
      scale,
    );

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
