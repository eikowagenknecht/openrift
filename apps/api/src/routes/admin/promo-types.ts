import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { PromoTypeResponse } from "@openrift/shared";
import { slugParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { createPromoTypeSchema, updatePromoTypeSchema } from "./schemas.js";

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
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      ),
    });
  })

  // ── POST /admin/promo-types ─────────────────────────────────────────────

  .openapi(createPromoType, async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { slug, label } = c.req.valid("json");

    const existing = await repo.getBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Promo type "${slug}" already exists`);
    }

    const created = await repo.create({ slug, label });
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
