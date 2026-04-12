import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

const raritySchema = z.object({
  slug: z.string().openapi({ example: "Rare" }),
  label: z.string().openapi({ example: "Rare" }),
  sortOrder: z.number().openapi({ example: 3 }),
  isWellKnown: z.boolean().openapi({ example: true }),
  color: z.string().nullable().openapi({ example: "#E052B1" }),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();

// ── Route definitions ───────────────────────────────────────────────────────

const listRarities = createRoute({
  method: "get",
  path: "/rarities",
  tags: ["Admin - Rarities"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ rarities: z.array(raritySchema) }),
        },
      },
      description: "List rarities",
    },
  },
});

const reorderRarities = createRoute({
  method: "put",
  path: "/rarities/reorder",
  tags: ["Admin - Rarities"],
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
    204: { description: "Rarities reordered" },
  },
});

const createRarity = createRoute({
  method: "post",
  path: "/rarities",
  tags: ["Admin - Rarities"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            slug: z.string().min(1),
            label: z.string().min(1),
            color: hexColorSchema.optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({ rarity: raritySchema }),
        },
      },
      description: "Rarity created",
    },
  },
});

const updateRarity = createRoute({
  method: "patch",
  path: "/rarities/{slug}",
  tags: ["Admin - Rarities"],
  request: {
    params: slugParamSchema,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            label: z.string().min(1).optional(),
            color: hexColorSchema.optional(),
          }),
        },
      },
    },
  },
  responses: {
    204: { description: "Rarity updated" },
  },
});

const deleteRarity = createRoute({
  method: "delete",
  path: "/rarities/{slug}",
  tags: ["Admin - Rarities"],
  request: {
    params: slugParamSchema,
  },
  responses: {
    204: { description: "Rarity deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminRaritiesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/rarities ──────────────────────────────────────────────
  .openapi(listRarities, async (c) => {
    const { rarities: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({ rarities: rows });
  })

  // ── PUT /admin/rarities/reorder ──────────────────────────────────────
  .openapi(reorderRarities, async (c) => {
    const { rarities: repo } = c.get("repos");
    const { slugs } = c.req.valid("json");

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allRarities = await repo.listAll();
    if (slugs.length !== allRarities.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allRarities.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allRarities.map((rarity) => rarity.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown rarity slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
    return c.body(null, 204);
  })

  // ── POST /admin/rarities ─────────────────────────────────────────────
  .openapi(createRarity, async (c) => {
    const { rarities: repo } = c.get("repos");
    const { slug, label, color } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Rarity "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label, color });
    return c.json({ rarity: created }, 201);
  })

  // ── PATCH /admin/rarities/:slug ──────────────────────────────────────
  .openapi(updateRarity, async (c) => {
    const { rarities: repo } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Rarity "${slug}" not found`);
    }

    const updates: { label?: string; color?: string | null } = {};
    if (body.label !== undefined) {
      updates.label = body.label;
    }
    if (body.color !== undefined) {
      updates.color = body.color;
    }

    if (Object.keys(updates).length > 0) {
      await repo.update(slug, updates);
    }

    return c.body(null, 204);
  })

  // ── DELETE /admin/rarities/:slug ─────────────────────────────────────
  .openapi(deleteRarity, async (c) => {
    const { rarities: repo } = c.get("repos");
    const { slug } = c.req.valid("param");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Rarity "${slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known rarity");
    }

    const inUse = await repo.isInUse(slug);
    if (inUse) {
      throw new AppError(
        409,
        "CONFLICT",
        "Cannot delete: rarity is in use by one or more printings",
      );
    }

    await repo.deleteBySlug(slug);
    return c.body(null, 204);
  });
