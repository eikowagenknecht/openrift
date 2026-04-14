import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { PromoTypeResponse } from "@openrift/shared";
import { idParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { createPromoTypeSchema, updatePromoTypeSchema } from "./schemas.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const promoTypeSchema = z.object({
  id: z.string().openapi({ example: "019d4999-4219-72f6-b7bb-64004e1b1bff" }),
  slug: z.string().openapi({ example: "prerift" }),
  label: z.string().openapi({ example: "Pre-Rift Promo" }),
  description: z.string().nullable().openapi({ example: "Cards from the Pre-Rift event" }),
  sortOrder: z.number().openapi({ example: 0 }),
  createdAt: z.string().openapi({ example: "2026-04-01T10:00:00.000Z" }),
  updatedAt: z.string().openapi({ example: "2026-04-01T10:00:00.000Z" }),
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
          schema: z.object({ promoTypes: z.array(promoTypeSchema) }),
        },
      },
      description: "List promo types",
    },
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
          schema: z.object({ promoType: promoTypeSchema }),
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
    params: idParamSchema,
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
    params: idParamSchema,
  },
  responses: {
    204: { description: "Promo type deleted" },
  },
});

const reorderPromoTypes = createRoute({
  method: "put",
  path: "/promo-types/reorder",
  tags: ["Admin - Promo Types"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ ids: z.array(z.string().min(1)).min(1) }),
        },
      },
    },
  },
  responses: {
    204: { description: "Promo types reordered" },
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
          description: r.description,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    });
  })

  // ── PUT /admin/promo-types/reorder ──────────────────────────────────────

  .openapi(reorderPromoTypes, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { ids } = c.req.valid("json");

    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Duplicate ids in reorder list.");
    }

    const all = await repo.listAll();
    if (ids.length !== all.length) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Expected ${all.length} ids, got ${ids.length}.`,
      );
    }

    const knownIds = new Set(all.map((pt) => pt.id));
    const unknown = ids.filter((id) => !knownIds.has(id));
    if (unknown.length > 0) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `Unknown promo type ids: ${unknown.join(", ")}`,
      );
    }

    await repo.reorder(ids);
    return c.body(null, 204);
  })

  // ── POST /admin/promo-types ─────────────────────────────────────────────

  .openapi(createPromoType, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { slug, label, description } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Promo type "${slug}" already exists`);
    }

    // Append to the end of the sort order so new entries don't collide.
    const maxSortOrder = await repo.getMaxSortOrder();
    const created = await repo.create({
      slug,
      label,
      description,
      sortOrder: maxSortOrder + 1,
    });
    return c.json({ promoType: created }, 201);
  })

  // ── PATCH /admin/promo-types/:id ────────────────────────────────────────

  .openapi(updatePromoType, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await repo.getById(id);
    assertFound(existing, `Promo type not found`);

    if (body.slug !== undefined && body.slug !== existing.slug) {
      const conflict = await repo.getBySlug(body.slug);
      if (conflict) {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${body.slug}" already in use`);
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
    assertFound(existing, `Promo type not found`);

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
