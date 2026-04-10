import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

const deckZoneSchema = z.object({
  slug: z.string().openapi({ example: "main" }),
  label: z.string().openapi({ example: "Main Deck" }),
  sortOrder: z.number().openapi({ example: 1 }),
  isWellKnown: z.boolean().openapi({ example: true }),
});

// ── Route definitions ───────────────────────────────────────────────────────

const listDeckZones = createRoute({
  method: "get",
  path: "/deck-zones",
  tags: ["Admin - Deck Zones"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ deckZones: z.array(deckZoneSchema) }),
        },
      },
      description: "List deck zones",
    },
  },
});

const reorderDeckZones = createRoute({
  method: "put",
  path: "/deck-zones/reorder",
  tags: ["Admin - Deck Zones"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ slugs: z.array(z.string().min(1)).min(1) }),
        },
      },
    },
  },
  responses: {
    204: { description: "Deck zones reordered" },
  },
});

const updateDeckZone = createRoute({
  method: "patch",
  path: "/deck-zones/{slug}",
  tags: ["Admin - Deck Zones"],
  request: {
    params: z.object({ slug: z.string().min(1) }),
    body: {
      content: {
        "application/json": {
          schema: z.object({ label: z.string().min(1).optional() }),
        },
      },
    },
  },
  responses: {
    204: { description: "Deck zone updated" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminDeckZonesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/deck-zones ────────────────────────────────────────────
  .openapi(listDeckZones, async (c) => {
    const { deckZones: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({ deckZones: rows });
  })

  // ── PUT /admin/deck-zones/reorder ────────────────────────────────────
  .openapi(reorderDeckZones, async (c) => {
    const { deckZones: repo } = c.get("repos");
    const { slugs } = c.req.valid("json");

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allZones = await repo.listAll();
    if (slugs.length !== allZones.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allZones.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allZones.map((zone) => zone.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown deck zone slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
    return c.body(null, 204);
  })

  // ── PATCH /admin/deck-zones/:slug ────────────────────────────────────
  .openapi(updateDeckZone, async (c) => {
    const { deckZones: repo } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const allZones = await repo.listAll();
    const existing = allZones.find((zone) => zone.slug === slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Deck zone "${slug}" not found`);
    }

    if (body.label) {
      await repo.update(slug, { label: body.label });
    }

    return c.body(null, 204);
  });
