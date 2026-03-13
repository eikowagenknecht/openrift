import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

export const ignoredProductsRoute = new Hono<{ Variables: Variables }>();

ignoredProductsRoute.use("/admin/ignored-products", requireAdmin);

// ── Schemas ─────────────────────────────────────────────────────────────────

const ignoreProductItemSchema = z.object({
  externalId: z.number(),
  finish: z.string(),
});

const ignoreProductsSchema = z.object({
  source: z.enum(["tcgplayer", "cardmarket"]),
  products: z.array(ignoreProductItemSchema).min(1),
});

// ── POST /admin/ignored-products ────────────────────────────────────────────

ignoredProductsRoute.post("/admin/ignored-products", async (c) => {
  const { source, products } = ignoreProductsSchema.parse(await c.req.json());

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
});

// ── DELETE /admin/ignored-products ──────────────────────────────────────────

ignoredProductsRoute.delete("/admin/ignored-products", async (c) => {
  const { source, products } = ignoreProductsSchema.parse(await c.req.json());

  for (const p of products) {
    await db
      .deleteFrom("marketplace_ignored_products")
      .where("marketplace", "=", source)
      .where("external_id", "=", p.externalId)
      .where("finish", "=", p.finish)
      .execute();
  }

  return c.json({ ok: true, unignored: products.length });
});

// ── Staging card overrides (manual product → card association) ───────────────

ignoredProductsRoute.use("/admin/staging-card-overrides", requireAdmin);

const stagingCardOverrideSchema = z.object({
  source: z.enum(["tcgplayer", "cardmarket"]),
  externalId: z.number(),
  finish: z.string(),
  cardId: z.string(),
});

ignoredProductsRoute.post("/admin/staging-card-overrides", async (c) => {
  const { source, externalId, finish, cardId } = stagingCardOverrideSchema.parse(
    await c.req.json(),
  );

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
});

const deleteOverrideSchema = z.object({
  source: z.enum(["tcgplayer", "cardmarket"]),
  externalId: z.number(),
  finish: z.string(),
});

ignoredProductsRoute.delete("/admin/staging-card-overrides", async (c) => {
  const { source, externalId, finish } = deleteOverrideSchema.parse(await c.req.json());

  await db
    .deleteFrom("marketplace_staging_card_overrides")
    .where("marketplace", "=", source)
    .where("external_id", "=", externalId)
    .where("finish", "=", finish)
    .execute();

  return c.json({ ok: true });
});
