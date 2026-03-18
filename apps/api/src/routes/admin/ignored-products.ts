import { zValidator } from "@hono/zod-validator";
import type { IgnoredProductResponse } from "@openrift/shared";
import { Hono } from "hono";
import { z } from "zod/v4";

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

// ── Route ───────────────────────────────────────────────────────────────────

export const ignoredProductsRoute = new Hono<{ Variables: Variables }>()

  // ── GET /admin/ignored-products ─────────────────────────────────────────────

  .get("/admin/ignored-products", async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const rows = await mktAdmin.listIgnoredProducts();

    const products: IgnoredProductResponse[] = rows.map((r) => ({
      marketplace: r.marketplace,
      externalId: r.externalId,
      finish: r.finish,
      productName: r.productName,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({ products });
  })

  // ── POST /admin/ignored-products ────────────────────────────────────────────

  .post("/admin/ignored-products", zValidator("json", ignoreProductsSchema), async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { source, products } = c.req.valid("json");

    // Look up product names from staging
    const externalIds = products.map((p) => p.externalId);
    const stagingRows = await mktAdmin.getStagingProductNames(source, externalIds);

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
      await mktAdmin.insertIgnoredProducts(values);
    }

    return c.json({ ignored: values.length });
  })

  // ── DELETE /admin/ignored-products ──────────────────────────────────────────

  .delete("/admin/ignored-products", zValidator("json", ignoreProductsSchema), async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { source, products } = c.req.valid("json");

    const deleted = await mktAdmin.deleteIgnoredProducts(
      source,
      products.map((p) => ({ externalId: p.externalId, finish: p.finish })),
    );

    return c.json({ unignored: deleted });
  });
