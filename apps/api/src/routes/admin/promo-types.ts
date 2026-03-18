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
    .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, "Slug must be kebab-case (e.g. nexus-night)"),
  label: z.string().min(1),
  sortOrder: z.number().int().optional(),
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
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
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

      if (body.slug !== undefined && body.slug !== existing.slug) {
        const conflict = await repo.getBySlug(body.slug);
        if (conflict) {
          throw new AppError(409, "CONFLICT", `Slug "${body.slug}" already in use`);
        }
      }

      await repo.update(id, { ...body, updatedAt: new Date() });
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
