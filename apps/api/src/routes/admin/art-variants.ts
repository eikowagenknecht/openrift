import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

const artVariantSchema = z.object({
  slug: z.string().openapi({ example: "alternate" }),
  label: z.string().openapi({ example: "Alternate Art" }),
  sortOrder: z.number().openapi({ example: 2 }),
  isWellKnown: z.boolean().openapi({ example: true }),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

// ── Route definitions ───────────────────────────────────────────────────────

const listArtVariants = createRoute({
  method: "get",
  path: "/art-variants",
  tags: ["Admin - Art Variants"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ artVariants: z.array(artVariantSchema) }),
        },
      },
      description: "List art variants",
    },
  },
});

const reorderArtVariants = createRoute({
  method: "put",
  path: "/art-variants/reorder",
  tags: ["Admin - Art Variants"],
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
    204: { description: "Art variants reordered" },
  },
});

const createArtVariant = createRoute({
  method: "post",
  path: "/art-variants",
  tags: ["Admin - Art Variants"],
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
          schema: z.object({ artVariant: artVariantSchema }),
        },
      },
      description: "Art variant created",
    },
  },
});

const updateArtVariant = createRoute({
  method: "patch",
  path: "/art-variants/{slug}",
  tags: ["Admin - Art Variants"],
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
    204: { description: "Art variant updated" },
  },
});

const deleteArtVariant = createRoute({
  method: "delete",
  path: "/art-variants/{slug}",
  tags: ["Admin - Art Variants"],
  request: {
    params: slugParamSchema,
  },
  responses: {
    204: { description: "Art variant deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminArtVariantsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/art-variants ──────────────────────────────────────────
  .openapi(listArtVariants, async (c) => {
    const { artVariants: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({ artVariants: rows });
  })

  // ── PUT /admin/art-variants/reorder ──────────────────────────────────
  .openapi(reorderArtVariants, async (c) => {
    const { artVariants: repo } = c.get("repos");
    const { slugs } = c.req.valid("json");

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allArtVariants = await repo.listAll();
    if (slugs.length !== allArtVariants.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allArtVariants.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allArtVariants.map((artVariant) => artVariant.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown art variant slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
    return c.body(null, 204);
  })

  // ── POST /admin/art-variants ─────────────────────────────────────────
  .openapi(createArtVariant, async (c) => {
    const { artVariants: repo } = c.get("repos");
    const { slug, label } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Art variant "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label });
    return c.json({ artVariant: created }, 201);
  })

  // ── PATCH /admin/art-variants/:slug ──────────────────────────────────
  .openapi(updateArtVariant, async (c) => {
    const { artVariants: repo } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Art variant "${slug}" not found`);
    }

    if (body.label) {
      await repo.update(slug, { label: body.label });
    }

    return c.body(null, 204);
  })

  // ── DELETE /admin/art-variants/:slug ─────────────────────────────────
  .openapi(deleteArtVariant, async (c) => {
    const { artVariants: repo } = c.get("repos");
    const { slug } = c.req.valid("param");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Art variant "${slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known art variant");
    }

    const inUse = await repo.isInUse(slug);
    if (inUse) {
      throw new AppError(
        409,
        "CONFLICT",
        "Cannot delete: art variant is in use by one or more printings",
      );
    }

    await repo.deleteBySlug(slug);
    return c.body(null, 204);
  });
