import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

const deckFormatSchema = z.object({
  slug: z.string().openapi({ example: "constructed" }),
  label: z.string().openapi({ example: "Constructed" }),
  sortOrder: z.number().openapi({ example: 1 }),
  isWellKnown: z.boolean().openapi({ example: true }),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

// ── Route definitions ───────────────────────────────────────────────────────

const listDeckFormats = createRoute({
  method: "get",
  path: "/deck-formats",
  tags: ["Admin - Deck Formats"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ deckFormats: z.array(deckFormatSchema) }),
        },
      },
      description: "List deck formats",
    },
  },
});

const reorderDeckFormats = createRoute({
  method: "put",
  path: "/deck-formats/reorder",
  tags: ["Admin - Deck Formats"],
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
    204: { description: "Deck formats reordered" },
  },
});

const createDeckFormat = createRoute({
  method: "post",
  path: "/deck-formats",
  tags: ["Admin - Deck Formats"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            slug: z
              .string()
              .min(1)
              .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "Slug must be kebab-case"),
            label: z.string().min(1),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({ deckFormat: deckFormatSchema }),
        },
      },
      description: "Deck format created",
    },
  },
});

const updateDeckFormat = createRoute({
  method: "patch",
  path: "/deck-formats/{slug}",
  tags: ["Admin - Deck Formats"],
  request: {
    params: slugParamSchema,
    body: {
      content: {
        "application/json": {
          schema: z.object({ label: z.string().min(1).optional() }),
        },
      },
    },
  },
  responses: {
    204: { description: "Deck format updated" },
  },
});

const deleteDeckFormat = createRoute({
  method: "delete",
  path: "/deck-formats/{slug}",
  tags: ["Admin - Deck Formats"],
  request: {
    params: slugParamSchema,
  },
  responses: {
    204: { description: "Deck format deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminDeckFormatsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/deck-formats ──────────────────────────────────────────
  .openapi(listDeckFormats, async (c) => {
    const { deckFormats: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({ deckFormats: rows });
  })

  // ── PUT /admin/deck-formats/reorder ──────────────────────────────────
  .openapi(reorderDeckFormats, async (c) => {
    const { deckFormats: repo } = c.get("repos");
    const { slugs } = c.req.valid("json");

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allDeckFormats = await repo.listAll();
    if (slugs.length !== allDeckFormats.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allDeckFormats.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allDeckFormats.map((deckFormat) => deckFormat.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown deck format slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
    return c.body(null, 204);
  })

  // ── POST /admin/deck-formats ─────────────────────────────────────────
  .openapi(createDeckFormat, async (c) => {
    const { deckFormats: repo } = c.get("repos");
    const { slug, label } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Deck format "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label });
    return c.json({ deckFormat: created }, 201);
  })

  // ── PATCH /admin/deck-formats/:slug ──────────────────────────────────
  .openapi(updateDeckFormat, async (c) => {
    const { deckFormats: repo } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Deck format "${slug}" not found`);
    }

    if (body.label) {
      await repo.update(slug, { label: body.label });
    }

    return c.body(null, 204);
  })

  // ── DELETE /admin/deck-formats/:slug ─────────────────────────────────
  .openapi(deleteDeckFormat, async (c) => {
    const { deckFormats: repo } = c.get("repos");
    const { slug } = c.req.valid("param");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Deck format "${slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known deck format");
    }

    const inUse = await repo.isInUse(slug);
    if (inUse) {
      throw new AppError(
        409,
        "CONFLICT",
        "Cannot delete: deck format is in use by one or more decks",
      );
    }

    await repo.deleteBySlug(slug);
    return c.body(null, 204);
  });
