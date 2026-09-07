import { aspectFromQuery, qrFromQuery, scaleFromQuery } from "@openrift/shared";
import { Hono } from "hono";

import { assertFound } from "../../lib/assertions.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { buildCollectionShareInput } from "../../services/collection-image.js";
import { shareUrlFromOrigin, siteHostFromOrigin } from "../../services/list-image.js";
import { renderImage } from "../../services/render-pool.js";
import type { Variables } from "../../types.js";

/**
 * Owner-authenticated download of a collection's share image: resolves by
 * collection id, unlike the public og:image route which resolves by share token.
 */
export const collectionImageRoute = new Hono<{ Variables: Variables }>()
  .basePath("/collections")
  // requireAuth is scoped to this route, not the whole /collections sub-app: a
  // blanket .use(requireAuth) would 401 anonymous callers of the public share view.
  .get("/:id/image.png", requireAuth, async (c) => {
    const { collections, copies } = c.get("repos");
    const config = c.get("config");
    const userId = getUserId(c);
    const id = c.req.param("id");

    // Personal ownership, not group access: this is the owner's download, and a
    // group collection's image is reachable through its share link instead.
    const collection = await collections.getByIdForUser(id, userId);
    assertFound(collection, "Not found");

    // Only a currently-public collection gets a QR: findByShareToken requires
    // is_public, so a revoked collection's stale token would 404 instead.
    const shareUrl =
      collection.isPublic && collection.shareToken
        ? shareUrlFromOrigin(config.corsOrigin, `/collections/share/${collection.shareToken}`)
        : undefined;

    const input = await buildCollectionShareInput({
      collectionId: collection.id,
      ownerName: c.get("user")?.name ?? "Anonymous",
      collectionName: collection.name,
      siteHost: siteHostFromOrigin(config.corsOrigin),
      shareUrl,
      copies,
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
