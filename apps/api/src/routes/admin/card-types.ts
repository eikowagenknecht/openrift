import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

const cardTypeSchema = z.object({
  slug: z.string().openapi({ example: "unit" }),
  label: z.string().openapi({ example: "Unit" }),
  sortOrder: z.number().openapi({ example: 1 }),
  isWellKnown: z.boolean().openapi({ example: true }),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

// ── Route definitions ───────────────────────────────────────────────────────

const listCardTypes = createRoute({
  method: "get",
  path: "/card-types",
  tags: ["Admin - Card Types"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ cardTypes: z.array(cardTypeSchema) }),
        },
      },
      description: "List card types",
    },
  },
});

const reorderCardTypes = createRoute({
  method: "put",
  path: "/card-types/reorder",
  tags: ["Admin - Card Types"],
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
    204: { description: "Card types reordered" },
  },
});

const createCardType = createRoute({
  method: "post",
  path: "/card-types",
  tags: ["Admin - Card Types"],
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
          schema: z.object({ cardType: cardTypeSchema }),
        },
      },
      description: "Card type created",
    },
  },
});

const updateCardType = createRoute({
  method: "patch",
  path: "/card-types/{slug}",
  tags: ["Admin - Card Types"],
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
    204: { description: "Card type updated" },
  },
});

const deleteCardType = createRoute({
  method: "delete",
  path: "/card-types/{slug}",
  tags: ["Admin - Card Types"],
  request: {
    params: slugParamSchema,
  },
  responses: {
    204: { description: "Card type deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminCardTypesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/card-types ────────────────────────────────────────────
  .openapi(listCardTypes, async (c) => {
    const { cardTypes: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({ cardTypes: rows });
  })

  // ── PUT /admin/card-types/reorder ────────────────────────────────────
  .openapi(reorderCardTypes, async (c) => {
    const { cardTypes: repo } = c.get("repos");
    const { slugs } = c.req.valid("json");

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allCardTypes = await repo.listAll();
    if (slugs.length !== allCardTypes.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allCardTypes.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allCardTypes.map((cardType) => cardType.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown card type slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
    return c.body(null, 204);
  })

  // ── POST /admin/card-types ───────────────────────────────────────────
  .openapi(createCardType, async (c) => {
    const { cardTypes: repo } = c.get("repos");
    const { slug, label } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Card type "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label });
    return c.json({ cardType: created }, 201);
  })

  // ── PATCH /admin/card-types/:slug ────────────────────────────────────
  .openapi(updateCardType, async (c) => {
    const { cardTypes: repo } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Card type "${slug}" not found`);
    }

    if (body.label) {
      await repo.update(slug, { label: body.label });
    }

    return c.body(null, 204);
  })

  // ── DELETE /admin/card-types/:slug ───────────────────────────────────
  .openapi(deleteCardType, async (c) => {
    const { cardTypes: repo } = c.get("repos");
    const { slug } = c.req.valid("param");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Card type "${slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known card type");
    }

    const inUse = await repo.isInUse(slug);
    if (inUse) {
      throw new AppError(
        409,
        "CONFLICT",
        "Cannot delete: card type is in use by one or more cards",
      );
    }

    await repo.deleteBySlug(slug);
    return c.body(null, 204);
  });
