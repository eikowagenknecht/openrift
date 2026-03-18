import { zValidator } from "@hono/zod-validator";
import type { PromoTypeResponse } from "@openrift/shared";
import { Hono } from "hono";
import { sql } from "kysely";
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

const idParamSchema = z.object({
  id: z.string().min(1),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminPromoTypesRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/promo-types ──────────────────────────────────────────────

  .get("/admin/promo-types", async (c) => {
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

      const slugChanging = body.slug !== undefined && body.slug !== existing.slug;

      await repo.update(id, { ...body, updatedAt: new Date() });

      // Cascade slug rename to all printings that use this promo type
      if (slugChanging) {
        const db = c.get("db");
        const io = c.get("io");
        const oldSlug = existing.slug;
        // slugChanging guard above ensures body.slug is defined
        const newSlug = body.slug as string;

        // Find all affected printings and their rehosted images
        const affectedImages = await db
          .selectFrom("printings as p")
          .innerJoin("printingImages as pi", "pi.printingId", "p.id")
          .innerJoin("sets as s", "s.id", "p.setId")
          .select([
            "p.id as printingId",
            "p.slug as printingSlug",
            "pi.id as imageId",
            "pi.rehostedUrl",
            "s.slug as setSlug",
          ])
          .where("p.promoTypeId", "=", id)
          .where("pi.rehostedUrl", "is not", null)
          .execute();

        // Rebuild printing slugs (replace 4th segment)
        const oldSuffix = `:${oldSlug}`;
        const newSuffix = `:${newSlug}`;
        await db
          .updateTable("printings")
          .set({
            slug: sql<string>`replace(slug, ${oldSuffix}, ${newSuffix})`,
            updatedAt: new Date(),
          })
          .where("promoTypeId", "=", id)
          .execute();

        // Rename rehosted files and update image URLs
        for (const img of affectedImages) {
          // WHERE filter guarantees rehostedUrl is not null
          const rehostedUrl = img.rehostedUrl as string;
          const oldFileBase = printingIdToFileBase(img.printingSlug);
          const newPrintingSlug = img.printingSlug.replace(oldSuffix, newSuffix);
          const newFileBase = printingIdToFileBase(newPrintingSlug);
          const newRehostedUrl = rehostedUrl.replace(oldFileBase, newFileBase);

          await renameRehostFiles(io, rehostedUrl, newRehostedUrl);
          await db
            .updateTable("printingImages")
            .set({ rehostedUrl: newRehostedUrl, updatedAt: new Date() })
            .where("id", "=", img.imageId)
            .execute();
        }
      }

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
