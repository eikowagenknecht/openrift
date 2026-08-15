import { Hono } from "hono";

import { assertFound } from "../../lib/assertions.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { renderCollectionImage } from "../../services/collection-image.js";
import { shareUrlFromOrigin, siteHostFromOrigin } from "../../services/list-image.js";
import { aspectFromQuery, qrFromQuery, scaleFromQuery } from "../../services/share-image-core.js";
import type { Variables } from "../../types.js";

/**
 * Owner-authenticated download of a collection's share image (ADR-024). The
 * share dialog's "Download image" uses this so it works whether or not the
 * collection is publicly shared: the public og:image route resolves by share
 * token, this one resolves the caller's own collection by id. `?aspect=vertical`
 * renders the 9:16 canvas, `?scale=N` the N× variant (`?size=hq` is the older
 * spelling of 2×), and `?qr=0` leaves the scannable mark off — the same contract
 * the list, deck and tier-list download routes carry.
 *
 * Owner-only, served `no-store` (the collection is mutable and this is an
 * on-demand, low-traffic download).
 */
export const collectionImageRoute = new Hono<{ Variables: Variables }>()
  .basePath("/collections")
  // `requireAuth` is scoped to this one route rather than mounted on the whole
  // `/collections` sub-app: a bare `.use(requireAuth)` would 401 anonymous
  // callers of the public `/collections/share/{token}` view and og:image (the
  // hazard list-image.ts documents, which once 401'd every shared list). The
  // `/:id/image.png` pattern is two segments deep, so it never collides with
  // the three-segment public one.
  .get("/:id/image.png", requireAuth, async (c) => {
    const { collections, copies } = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const userId = getUserId(c);
    const id = c.req.param("id");

    // Personal ownership, not group access: this is the owner's download, and a
    // group collection's image is reachable through its share link instead.
    const collection = await collections.getByIdForUser(id, userId);
    assertFound(collection, "Not found");

    // Only a collection that is *currently* public gets a QR: `findByShareToken`
    // requires `is_public`, so encoding a revoked collection's stale token would
    // put a 404 behind the code. No token, no mark — the renderer drops it.
    const shareUrl =
      collection.isPublic && collection.shareToken
        ? shareUrlFromOrigin(config.corsOrigin, `/collections/share/${collection.shareToken}`)
        : undefined;

    const png = await renderCollectionImage(
      io,
      {
        collectionId: collection.id,
        ownerName: c.get("user")?.name ?? "Anonymous",
        collectionName: collection.name,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl,
        copies,
      },
      scaleFromQuery(c.req.query("scale"), c.req.query("size")),
      { aspect: aspectFromQuery(c.req.query("aspect")), qr: qrFromQuery(c.req.query("qr")) },
    );

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
