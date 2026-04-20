import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

const superTypeSchema = z.object({
  slug: z.string().openapi({ example: "champion" }),
  label: z.string().openapi({ example: "Champion" }),
  sortOrder: z.number().openapi({ example: 1 }),
  isWellKnown: z.boolean().openapi({ example: true }),
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

// ── Route definitions ───────────────────────────────────────────────────────

const listSuperTypes = createRoute({
  method: "get",
  path: "/super-types",
  tags: ["Admin - Super Types"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ superTypes: z.array(superTypeSchema) }),
        },
      },
      description: "List super types",
    },
  },
});

const reorderSuperTypes = createRoute({
  method: "put",
  path: "/super-types/reorder",
  tags: ["Admin - Super Types"],
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
    204: { description: "Super types reordered" },
  },
});

const createSuperType = createRoute({
  method: "post",
  path: "/super-types",
  tags: ["Admin - Super Types"],
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
          schema: z.object({ superType: superTypeSchema }),
        },
      },
      description: "Super type created",
    },
  },
});

const updateSuperType = createRoute({
  method: "patch",
  path: "/super-types/{slug}",
  tags: ["Admin - Super Types"],
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
    204: { description: "Super type updated" },
  },
});

const deleteSuperType = createRoute({
  method: "delete",
  path: "/super-types/{slug}",
  tags: ["Admin - Super Types"],
  request: {
    params: slugParamSchema,
  },
  responses: {
    204: { description: "Super type deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminSuperTypesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/super-types ───────────────────────────────────────────
  .openapi(listSuperTypes, async (c) => {
    const { superTypes: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({ superTypes: rows });
  })

  // ── PUT /admin/super-types/reorder ───────────────────────────────────
  .openapi(reorderSuperTypes, async (c) => {
    const { superTypes: repo } = c.get("repos");
    const { slugs } = c.req.valid("json");

    const uniqueSlugs = new Set(slugs);
    if (uniqueSlugs.size !== slugs.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate slugs in reorder list.");
    }

    const allSuperTypes = await repo.listAll();
    if (slugs.length !== allSuperTypes.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${allSuperTypes.length} slugs, got ${slugs.length}.`,
      );
    }

    const knownSlugs = new Set(allSuperTypes.map((superType) => superType.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown super type slugs: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(slugs);
    return c.body(null, 204);
  })

  // ── POST /admin/super-types ──────────────────────────────────────────
  .openapi(createSuperType, async (c) => {
    const { superTypes: repo } = c.get("repos");
    const { slug, label } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Super type "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label });
    return c.json({ superType: created }, 201);
  })

  // ── PATCH /admin/super-types/:slug ───────────────────────────────────
  .openapi(updateSuperType, async (c) => {
    const { superTypes: repo } = c.get("repos");
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Super type "${slug}" not found`);
    }

    if (body.label) {
      await repo.update(slug, { label: body.label });
    }

    return c.body(null, 204);
  })

  // ── DELETE /admin/super-types/:slug ──────────────────────────────────
  .openapi(deleteSuperType, async (c) => {
    const { superTypes: repo } = c.get("repos");
    const { slug } = c.req.valid("param");

    const existing = await repo.getBySlug(slug);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Super type "${slug}" not found`);
    }

    if (existing.isWellKnown) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Cannot delete a well-known super type");
    }

    const inUse = await repo.isInUse(slug);
    if (inUse) {
      throw new AppError(
        409,
        "CONFLICT",
        "Cannot delete: super type is in use by one or more cards",
      );
    }

    await repo.deleteBySlug(slug);
    return c.body(null, 204);
  });
