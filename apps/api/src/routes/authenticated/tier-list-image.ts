import { aspectFromQuery, qrFromQuery, scaleFromQuery } from "@openrift/shared";
import { Hono } from "hono";

import { assertFound } from "../../lib/assertions.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { siteHostFromOrigin } from "../../services/list-image.js";
import { renderImage } from "../../services/render-pool.js";
import { buildTierListImageRows } from "../../services/tier-list-image.js";
import type { Variables } from "../../types.js";

/**
 * Resolves the caller's own list by id, unlike the public og:image route which
 * resolves by share token, so the export button works before a list is shared.
 */
export const tierListImageRoute = new Hono<{ Variables: Variables }>()
  .basePath("/tier-lists")
  // requireAuth is scoped to this route, not the `/tier-lists` sub-app, so it
  // doesn't 401 the public `/tier-lists/share/{token}` og:image.
  .get("/:id/image.png", requireAuth, async (c) => {
    const repos = c.get("repos");
    const config = c.get("config");
    const userId = getUserId(c);
    const scale = scaleFromQuery(c.req.query("scale"), c.req.query("size"));
    const aspect = aspectFromQuery(c.req.query("aspect"));
    const withQr = qrFromQuery(c.req.query("qr"));

    const tierList = await repos.tierLists.getByIdForUser(c.req.param("id"), userId);
    assertFound(tierList, "Not found");

    const rows = await buildTierListImageRows(repos, tierList.tiers);
    // The first CORS origin is the canonical site origin.
    const firstOrigin = config.corsOrigin?.split(",")[0]?.trim();
    const shareUrl =
      withQr && tierList.isPublic && tierList.shareToken && firstOrigin
        ? `${firstOrigin}/tier-lists/share/${tierList.shareToken}`
        : undefined;

    const png = await renderImage({
      kind: "tierList",
      input: {
        title: tierList.title,
        ownerName: c.get("user")?.name ?? undefined,
        rows,
        siteHost: siteHostFromOrigin(config.corsOrigin),
        shareUrl,
      },
      scale,
      aspect,
    });

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
