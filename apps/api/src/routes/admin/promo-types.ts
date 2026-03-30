import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { PromoTypeResponse } from "@openrift/shared";
import { slugParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const createPromoTypeSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "Slug must be kebab-case (e.g. nexus-night)"),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

const reorderPromoTypesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

const updatePromoTypeSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "Slug must be kebab-case")
    .optional(),
  label: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

// ── Route definitions ───────────────────────────────────────────────────────

const listPromoTypes = createRoute({
  method: "get",
  path: "/promo-types",
  tags: ["Admin - Promo Types"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            promoTypes: z.array(
              z.object({
                id: z.string(),
                slug: z.string(),
                label: z.string(),
                sortOrder: z.number(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
          }),
        },
      },
      description: "List promo types",
    },
  },
});

const reorderPromoTypes = createRoute({
  method: "put",
  path: "/promo-types/reorder",
  tags: ["Admin - Promo Types"],
  request: {
    body: { content: { "application/json": { schema: reorderPromoTypesSchema } } },
  },
  responses: {
    204: { description: "Promo types reordered" },
  },
});

const createPromoType = createRoute({
  method: "post",
  path: "/promo-types",
  tags: ["Admin - Promo Types"],
  request: {
    body: { content: { "application/json": { schema: createPromoTypeSchema } } },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            promoType: z.object({
              id: z.string(),
              slug: z.string(),
              label: z.string(),
              sortOrder: z.number(),
              createdAt: z.string(),
              updatedAt: z.string(),
            }),
          }),
        },
      },
      description: "Promo type created",
    },
  },
});

const updatePromoType = createRoute({
  method: "patch",
  path: "/promo-types/{id}",
  tags: ["Admin - Promo Types"],
  request: {
    params: slugParamSchema,
    body: { content: { "application/json": { schema: updatePromoTypeSchema } } },
  },
  responses: {
    204: { description: "Promo type updated" },
  },
});

const deletePromoType = createRoute({
  method: "delete",
  path: "/promo-types/{id}",
  tags: ["Admin - Promo Types"],
  request: {
    params: slugParamSchema,
  },
  responses: {
    204: { description: "Promo type deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminPromoTypesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/promo-types ──────────────────────────────────────────────

  .openapi(listPromoTypes, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const rows = await repo.listAll();
    return c.json({
      promoTypes: rows.map(
        (r): PromoTypeResponse => ({
          id: r.id,
          slug: r.slug,
          label: r.label,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    });
  })

  // ── PUT /admin/promo-types/reorder ─────────────────────────────────────

  .openapi(reorderPromoTypes, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { ids } = c.req.valid("json");

    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new AppError(400, "BAD_REQUEST", "Duplicate promo type IDs in reorder list.");
    }

    const allTypes = await repo.listAll();
    if (ids.length !== allTypes.length) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Expected ${allTypes.length} promo type IDs, got ${ids.length}.`,
      );
    }

    const knownIds = new Set(allTypes.map((t) => t.id));
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new AppError(400, "BAD_REQUEST", `Unknown promo type IDs: ${unknown.join(", ")}`);
    }

    await repo.reorder(ids);
    return c.body(null, 204);
  })

  // ── POST /admin/promo-types ─────────────────────────────────────────────

  .openapi(createPromoType, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { slug, label, sortOrder } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, "CONFLICT", `Promo type "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label, sortOrder });
    return c.json({ promoType: created }, 201);
  })

  // ── PATCH /admin/promo-types/:id ────────────────────────────────────────

  .openapi(updatePromoType, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getById(id);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", `Promo type not found`);
    }

    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, "CONFLICT", `Slug "${body.slug}" already in use`);
      }
    }

    await repo.update(id, body);

    return c.body(null, 204);
  })

  // ── DELETE /admin/promo-types/:id ───────────────────────────────────────

  .openapi(deletePromoType, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { id } = c.req.valid("param");

    const existing = await repo.getById(id);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", `Promo type not found`);
    }

    const inUse = await repo.isInUse(id);
    if (inUse) {
      throw new AppError(
        409,
        "CONFLICT",
        "Cannot delete: promo type is in use by one or more printings",
      );
    }

    await repo.deleteById(id);
    return c.body(null, 204);
  });
