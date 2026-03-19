import { zValidator } from "@hono/zod-validator";
import type { PromoTypeResponse } from "@openrift/shared";
import { slugParamSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { z } from "zod/v4";

import { AppError } from "../../errors.js";
import { printingIdToFileBase, renameRehostFiles } from "../../services/image-rehost.js";
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

// ── Route ───────────────────────────────────────────────────────────────────

export const adminPromoTypesRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/promo-types ──────────────────────────────────────────────

  .get("/promo-types", async (c) => {
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

  // ── POST /admin/promo-types ─────────────────────────────────────────────

  .post("/promo-types", zValidator("json", createPromoTypeSchema), async (c) => {
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
    "/promo-types/:id",
    zValidator("param", slugParamSchema),
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

      const slugChanging = body.slug !== undefined && body.slug !== existing.slug;

      await repo.update(id, body);

      // Cascade slug rename to all printings that use this promo type
      if (slugChanging) {
        const io = c.get("io");
        const oldSuffix = `:${existing.slug}`;
        const newSuffix = `:${body.slug as string}`;

        const affectedImages = await repo.affectedImagesByPromoType(id);
        await repo.renamePrintingSlugs(id, oldSuffix, newSuffix);

        for (const img of affectedImages) {
          const oldFileBase = printingIdToFileBase(img.printingSlug);
          const newPrintingSlug = img.printingSlug.replace(oldSuffix, newSuffix);
          const newFileBase = printingIdToFileBase(newPrintingSlug);
          const newRehostedUrl = img.rehostedUrl.replace(oldFileBase, newFileBase);

          await renameRehostFiles(io, img.rehostedUrl, newRehostedUrl);
          await repo.updateImageRehostedUrl(img.imageId, newRehostedUrl);
        }
      }

      return c.body(null, 204);
    },
  )

  // ── DELETE /admin/promo-types/:id ───────────────────────────────────────

  .delete("/promo-types/:id", zValidator("param", slugParamSchema), async (c) => {
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
