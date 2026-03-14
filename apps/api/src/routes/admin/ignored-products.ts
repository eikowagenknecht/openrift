import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const ignoreProductItemSchema = z.object({
  externalId: z.number(),
  finish: z.string(),
});

const ignoreProductsSchema = z.object({
  source: z.enum(["tcgplayer", "cardmarket"]),
  products: z.array(ignoreProductItemSchema).min(1),
});

const stagingCardOverrideSchema = z.object({
  source: z.enum(["tcgplayer", "cardmarket"]),
  externalId: z.number(),
  finish: z.string(),
  cardId: z.string(),
});

const deleteOverrideSchema = z.object({
  source: z.enum(["tcgplayer", "cardmarket"]),
  externalId: z.number(),
  finish: z.string(),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const ignoredProductsRoute = new Hono<{ Variables: Variables }>()

  .use("/admin/ignored-products", requireAdmin)

  // ── GET /admin/ignored-products ─────────────────────────────────────────────

  .get("/admin/ignored-products", async (c) => {
    const rows = await db
      .selectFrom("marketplace_ignored_products as ip")
      .select(["ip.marketplace", "ip.external_id", "ip.finish", "ip.product_name", "ip.created_at"])
      .orderBy("ip.created_at", "desc")
      .execute();

    return c.json({
      products: rows.map((r) => ({
        marketplace: r.marketplace,
        externalId: r.external_id,
        finish: r.finish,
        productName: r.product_name,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      })),
    });
  })

  // ── POST /admin/ignored-products ────────────────────────────────────────────

  .post("/admin/ignored-products", zValidator("json", ignoreProductsSchema), async (c) => {
    const { source, products } = c.req.valid("json");

    // Look up product names from staging
    const externalIds = products.map((p) => p.externalId);
    const stagingRows = await db
      .selectFrom("marketplace_staging")
      .select(["external_id", "product_name"])
      .where("marketplace", "=", source)
      .where("external_id", "in", externalIds)
      .execute();

    const nameMap = new Map<number, string>();
    for (const row of stagingRows) {
      if (!nameMap.has(row.external_id)) {
        nameMap.set(row.external_id, row.product_name);
      }
    }

    // Insert into ignored products table (staging data is kept)
    const values = products
      .filter((p) => nameMap.has(p.externalId))
      .map((p) => ({
        marketplace: source,
        external_id: p.externalId,
        finish: p.finish,
        product_name: nameMap.get(p.externalId) ?? "",
      }));

    if (values.length > 0) {
      await db
        .insertInto("marketplace_ignored_products")
        .values(values)
        .onConflict((oc) => oc.columns(["marketplace", "external_id", "finish"]).doNothing())
        .execute();
    }

    return c.json({ ok: true, ignored: products.length });
  })

  // ── DELETE /admin/ignored-products ──────────────────────────────────────────

  .delete("/admin/ignored-products", zValidator("json", ignoreProductsSchema), async (c) => {
    const { source, products } = c.req.valid("json");

    for (const p of products) {
      await db
        .deleteFrom("marketplace_ignored_products")
        .where("marketplace", "=", source)
        .where("external_id", "=", p.externalId)
        .where("finish", "=", p.finish)
        .execute();
    }

    return c.json({ ok: true, unignored: products.length });
  })

  // ── Staging card overrides (manual product → card association) ───────────────

  .use("/admin/staging-card-overrides", requireAdmin)

  .post(
    "/admin/staging-card-overrides",
    zValidator("json", stagingCardOverrideSchema),
    async (c) => {
      const { source, externalId, finish, cardId } = c.req.valid("json");

      await db
        .insertInto("marketplace_staging_card_overrides")
        .values({
          marketplace: source,
          external_id: externalId,
          finish,
          card_id: cardId,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "external_id", "finish"]).doUpdateSet({ card_id: cardId }),
        )
        .execute();

      return c.json({ ok: true });
    },
  )

  .delete("/admin/staging-card-overrides", zValidator("json", deleteOverrideSchema), async (c) => {
    const { source, externalId, finish } = c.req.valid("json");

    await db
      .deleteFrom("marketplace_staging_card_overrides")
      .where("marketplace", "=", source)
      .where("external_id", "=", externalId)
      .where("finish", "=", finish)
      .execute();

    return c.json({ ok: true });
  });
