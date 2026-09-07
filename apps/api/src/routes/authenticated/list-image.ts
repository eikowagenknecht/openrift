import { aspectFromQuery, qrFromQuery, scaleFromQuery } from "@openrift/shared/share-image-params";
import { Hono } from "hono";

import { assertFound } from "../../lib/assertions.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import {
  buildListShareInput,
  shareUrlFromOrigin,
  siteHostFromOrigin,
} from "../../services/list-image.js";
import { renderImage } from "../../services/render-pool.js";
import type { Variables } from "../../types.js";

/**
 * Owner-authenticated download of a list's share image, resolving the list by
 * id (the public og:image route resolves by share token instead). `?size=hq`
 * is the older spelling of `?scale=2`.
 */
export const listImageRoute = new Hono<{ Variables: Variables }>()
  .basePath("/lists")
  // requireAuth is scoped to this one route: a bare `.use(requireAuth)` on the
  // sub-app would 401 the public `GET /api/v1/lists/share/{token}` route too.
  .get("/:id/image.png", requireAuth, async (c) => {
    const { lists, canonicalPrintings } = c.get("repos");
    const config = c.get("config");
    const userId = getUserId(c);
    const id = c.req.param("id");

    const list = await lists.getByIdForUser(id, userId);
    assertFound(list, "Not found");

    const entries = await lists.entriesWithDetailsAnon(list.id, list.kind);
    // Only a list that is *currently* public gets a QR: `findByShareToken`
    // requires `is_public`, so encoding a revoked list's stale token would put a
    // 404 on the image. No token, no mark — the renderer drops it.
    const input = await buildListShareInput({
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
    });
    const png = await renderImage({
      kind: "share",
      input,
      scale: scaleFromQuery(c.req.query("scale"), c.req.query("size")),
      options: {
        aspect: aspectFromQuery(c.req.query("aspect")),
        qr: qrFromQuery(c.req.query("qr")),
      },
    });

    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  });
