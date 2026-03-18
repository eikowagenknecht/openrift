import { zValidator } from "@hono/zod-validator";
import type { PromoTypeResponse } from "@openrift/shared";
import { Hono } from "hono";
import { z } from "zod/v4";

import { AppError } from "../../errors.js";
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const createPromoTypeSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be kebab-case (e.g. nexus-night)"),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

const updatePromoTypeSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be kebab-case")
    .optional(),
  label: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

const idParamSchema = z.object({
  id: z.string().min(1),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminPromoTypesRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/promo-types ──────────────────────────────────────────────

  .get("/admin/promo-types", async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const rows = await repo.listAll();
    const promoTypes: PromoTypeResponse[] = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      label: r.label,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    }));
    return c.json({ promoTypes });
  })

  // ── POST /admin/promo-types ─────────────────────────────────────────────

  .post("/admin/promo-types", zValidator("json", createPromoTypeSchema), async (c) => {
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

  .patch(
    "/admin/promo-types/:id",
    zValidator("param", idParamSchema),
    zValidator("json", updatePromoTypeSchema),
    async (c) => {
      const { promoTypes: repo } = c.get("repos");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const existing = await repo.getById(id);
      if (!existing) {
        throw new AppError(404, "NOT_FOUND", `Promo type not found`);
      }

      if (body.slug && body.slug !== existing.slug) {
        const conflict = await repo.getBySlug(body.slug);
        if (conflict) {
          throw new AppError(409, "CONFLICT", `Slug "${body.slug}" already in use`);
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.slug !== undefined) {
        updates.slug = body.slug;
      }
      if (body.label !== undefined) {
        updates.label = body.label;
      }
      if (body.sortOrder !== undefined) {
        updates.sortOrder = body.sortOrder;
      }

      await repo.update(id, updates);
      return c.body(null, 204);
    },
  )

  // ── DELETE /admin/promo-types/:id ───────────────────────────────────────

  .delete("/admin/promo-types/:id", zValidator("param", idParamSchema), async (c) => {
    const { promoTypes: repo } = c.get("repos");
    const { id } = c.req.valid("param");

    const existing = await repo.getById(id);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", `Promo type not found`);
    }

    // Check if any printings reference this promo type
    const inUse = await c
      .get("db")
      .selectFrom("printings")
      .select("id")
      .where("promoTypeId", "=", id)
      .limit(1)
      .executeTakeFirst();

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
