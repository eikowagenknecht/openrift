import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Route definitions ───────────────────────────────────────────────────────

const getCacheStatus = createRoute({
  method: "get",
  path: "/cache/status",
  tags: ["Admin - Cache"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            configured: z.boolean().openapi({ example: true }),
          }),
        },
      },
      description: "Whether Cloudflare cache purging is configured",
    },
  },
});

const purgeCache = createRoute({
  method: "post",
  path: "/cache/purge",
  tags: ["Admin - Cache"],
  responses: {
    204: { description: "Cache purged" },
    503: { description: "Cloudflare credentials not configured" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminCacheRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /cache/status ────────────────────────────────────────────────────

  .openapi(getCacheStatus, (c) => {
    const config = c.get("config");
    return c.json({ configured: config.cloudflare !== undefined });
  })

  // ── POST /cache/purge ────────────────────────────────────────────────────

  .openapi(purgeCache, async (c) => {
    const config = c.get("config");
    const { fetch } = c.get("io");

    if (!config.cloudflare) {
      throw new AppError(
        503,
        ERROR_CODES.INTERNAL_ERROR,
        "Cloudflare credentials not configured (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID)",
      );
    }

    const { apiToken, zoneId } = config.cloudflare;
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purge_everything: true }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new AppError(
        502,
        ERROR_CODES.INTERNAL_ERROR,
        `Cloudflare purge failed (${res.status}): ${body.slice(0, 500)}`,
      );
    }

    return c.body(null, 204);
  });
