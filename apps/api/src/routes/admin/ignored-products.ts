import { zValidator } from "@hono/zod-validator";
import type { IgnoredProductResponse } from "@openrift/shared";
import { Hono } from "hono";
import { z } from "zod/v4";

import { requireAdmin } from "../../middleware/require-admin.js";
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
    const db = c.get("db");
    const rows = await db
      .selectFrom("marketplaceIgnoredProducts as ip")
      .select(["ip.marketplace", "ip.externalId", "ip.finish", "ip.productName", "ip.createdAt"])
      .orderBy("ip.createdAt", "desc")
      .execute();

    const products: IgnoredProductResponse[] = rows.map((r) => ({
      marketplace: r.marketplace,
      externalId: r.externalId,
      finish: r.finish,
      productName: r.productName,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));
    return c.json({ products });
  })

  // ── POST /admin/ignored-products ────────────────────────────────────────────

  .post("/admin/ignored-products", zValidator("json", ignoreProductsSchema), async (c) => {
    const db = c.get("db");
    const { source, products } = c.req.valid("json");

    // Look up product names from staging
    const externalIds = products.map((p) => p.externalId);
    const stagingRows = await db
      .selectFrom("marketplaceStaging")
      .select(["externalId", "productName"])
      .where("marketplace", "=", source)
      .where("externalId", "in", externalIds)
      .execute();

    const nameMap = new Map<number, string>();
    for (const row of stagingRows) {
      if (!nameMap.has(row.externalId)) {
        nameMap.set(row.externalId, row.productName);
      }
    }

    // Insert into ignored products table (staging data is kept)
    const values = products
      .filter((p) => nameMap.has(p.externalId))
      .map((p) => ({
        marketplace: source,
        externalId: p.externalId,
        finish: p.finish,
        productName: nameMap.get(p.externalId) ?? "",
      }));

    if (values.length > 0) {
      await db
        .insertInto("marketplaceIgnoredProducts")
        .values(values)
        .onConflict((oc) => oc.columns(["marketplace", "externalId", "finish"]).doNothing())
        .execute();
    }

    return c.json({ ignored: products.length });
  })

  // ── DELETE /admin/ignored-products ──────────────────────────────────────────

  .delete("/admin/ignored-products", zValidator("json", ignoreProductsSchema), async (c) => {
    const db = c.get("db");
    const { source, products } = c.req.valid("json");

    for (const p of products) {
      await db
        .deleteFrom("marketplaceIgnoredProducts")
        .where("marketplace", "=", source)
        .where("externalId", "=", p.externalId)
        .where("finish", "=", p.finish)
        .execute();
    }

    return c.json({ unignored: products.length });
  })

  // ── Staging card overrides (manual product → card association) ───────────────

  .use("/admin/staging-card-overrides", requireAdmin)

  .post(
    "/admin/staging-card-overrides",
    zValidator("json", stagingCardOverrideSchema),
    async (c) => {
      const db = c.get("db");
      const { source, externalId, finish, cardId } = c.req.valid("json");

      await db
        .insertInto("marketplaceStagingCardOverrides")
        .values({
          marketplace: source,
          externalId,
          finish,
          cardId,
        })
        .onConflict((oc) =>
          oc.columns(["marketplace", "externalId", "finish"]).doUpdateSet({ cardId }),
        )
        .execute();

      return c.body(null, 204);
    },
  )

  .delete("/admin/staging-card-overrides", zValidator("json", deleteOverrideSchema), async (c) => {
    const db = c.get("db");
    const { source, externalId, finish } = c.req.valid("json");

    await db
      .deleteFrom("marketplaceStagingCardOverrides")
      .where("marketplace", "=", source)
      .where("externalId", "=", externalId)
      .where("finish", "=", finish)
      .execute();

    return c.body(null, 204);
  });
