import { Hono } from "hono";

import { assertFound } from "../../lib/assertions.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { siteHostFromOrigin } from "../../services/list-image.js";
import { aspectFromQuery, qrFromQuery, scaleFromQuery } from "../../services/share-image-core.js";
import { buildTierListImageRows, renderTierListImage } from "../../services/tier-list-image.js";
import type { Variables } from "../../types.js";

/**
 * Owner-authenticated download of a tier list's image. The builder's export
 * button uses this so the download works before the list is shared at all: the
 * public og:image route resolves by share token, this one resolves the caller's
 * own list by id. `?aspect=vertical` renders the 9:16 canvas, `?scale=N` the N×
 * variant (`?size=hq` is the older spelling of 2×), and `?qr=0` leaves the
 * scannable mark off.
 *
 * Owner-only, served `no-store` — the board is mutable and this is an on-demand,
 * low-traffic download, unlike the immutably-cached public image.
 */
export const tierListImageRoute = new Hono<{ Variables: Variables }>()
  .basePath("/tier-lists")
  // `requireAuth` is scoped to this one route rather than mounted on the whole
  // `/tier-lists` sub-app: a bare `.use(requireAuth)` would 401 anonymous
  // callers of the public `/tier-lists/share/{token}` og:image (the same hazard
  // deck-image.ts and list-image.ts document). The `/:id/image.png` pattern is
  // two segments deep, so it never collides with the three-segment public one.
  .get("/:id/image.png", requireAuth, async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const io = c.get("io");
    const userId = getUserId(c);
    const scale = scaleFromQuery(c.req.query("scale"), c.req.query("size"));
    const aspect = aspectFromQuery(c.req.query("aspect"));
    const withQr = qrFromQuery(c.req.query("qr"));

    const tierList = await repos.tierLists.getByIdForUser(c.req.param("id"), userId);
    assertFound(tierList, "Not found");

    const rows = await buildTierListImageRows(repos, tierList.tiers);
    // Only a shared list has a viewable link, so the QR is dropped for private
    // ones, and `?qr=0` drops it for a creator who asked for a clean plate. The
    // first CORS origin is the canonical site origin.
    const firstOrigin = config.corsOrigin?.split(",")[0]?.trim();
    const shareUrl =
      withQr && tierList.isPublic && tierList.shareToken && firstOrigin
        ? `${firstOrigin}/tier-lists/share/${tierList.shareToken}`
        : undefined;

    const png = await renderTierListImage(
      io,
      {
        title: tierList.title,
        ownerName: c.get("user")?.name ?? undefined,
        rows,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl,
      },
      scale,
      aspect,
    );

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
