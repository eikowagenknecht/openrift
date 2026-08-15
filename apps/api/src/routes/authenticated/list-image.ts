import { Hono } from "hono";

import { assertFound } from "../../lib/assertions.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  renderListImage,
  shareUrlFromOrigin,
  siteHostFromOrigin,
} from "../../services/list-image.js";
import { aspectFromQuery, qrFromQuery, scaleFromQuery } from "../../services/share-image-core.js";
import type { Variables } from "../../types.js";

/**
 * Owner-authenticated download of a list's share image (ADR-024). The share
 * dialog's "Download image" uses this so it works whether or not the list is
 * publicly shared: the public og:image route resolves by share token, this one
 * resolves the caller's own list by id. `?aspect=vertical` renders the 9:16
 * canvas, `?scale=N` the N× variant (`?size=hq` is the older spelling of 2×),
 * and `?qr=0` leaves the scannable mark off — the same contract the deck and
 * tier-list download routes carry.
 *
 * Owner-only, served `no-store` (the list is mutable and this is an on-demand,
 * low-traffic download).
 */
export const listImageRoute = new Hono<{ Variables: Variables }>()
  .basePath("/lists")
  // `requireAuth` is scoped to this one route, not mounted as `.use()` on the
  // whole `/lists` sub-app: a bare `.use(requireAuth)` runs for every
  // `/api/v1/lists/*` path this sub-app sees and 401s anonymous callers before
  // they fall through to the oRPC catch-all — which silently gated the public
  // `GET /api/v1/lists/share/{token}` share view (every shared-list link 401'd).
  .get("/:id/image.png", requireAuth, async (c) => {
    const { lists, canonicalPrintings } = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const userId = getUserId(c);
    const id = c.req.param("id");

    const list = await lists.getByIdForUser(id, userId);
    assertFound(list, "Not found");

    const entries = await lists.entriesWithDetailsAnon(list.id, list.kind);
    // Only a list that is *currently* public gets a QR: `findByShareToken`
    // requires `is_public`, so encoding a revoked list's stale token would put a
    // 404 on the image. No token, no mark — the renderer drops it.
    const png = await renderListImage(
      io,
      {
        ownerName: c.get("user")?.name ?? "Anonymous",
        listName: list.name,
        intent: list.intent,
        kind: list.kind,
        entries,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl:
          list.isPublic && list.shareToken
            ? shareUrlFromOrigin(config.corsOrigin, `/lists/share/${list.shareToken}`)
            : undefined,
        canonicalPrintings,
      },
      scaleFromQuery(c.req.query("scale"), c.req.query("size")),
      { aspect: aspectFromQuery(c.req.query("aspect")), qr: qrFromQuery(c.req.query("qr")) },
    );

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
