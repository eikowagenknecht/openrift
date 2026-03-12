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
  const stagingTable =
    source === "tcgplayer" ? ("tcgplayer_staging" as const) : ("cardmarket_staging" as const);
  const ignoreTable =
    source === "tcgplayer"
      ? ("tcgplayer_ignored_products" as const)
      : ("cardmarket_ignored_products" as const);

  // Look up product names from staging
  const externalIds = products.map((p) => p.externalId);
  const stagingRows = await db
    .selectFrom(stagingTable)
    .select(["external_id", "product_name"])
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
      external_id: p.externalId,
      finish: p.finish,
      product_name: nameMap.get(p.externalId) ?? "",
    }));

  if (values.length > 0) {
    await db
      .insertInto(ignoreTable)
      .values(values)
      .onConflict((oc) => oc.columns(["external_id", "finish"]).doNothing())
      .execute();
  }

  return c.json({ ok: true, ignored: products.length });
});

// ── DELETE /admin/ignored-products ──────────────────────────────────────────

ignoredProductsRoute.delete("/admin/ignored-products", async (c) => {
  const { source, products } = ignoreProductsSchema.parse(await c.req.json());
  const ignoreTable =
    source === "tcgplayer"
      ? ("tcgplayer_ignored_products" as const)
      : ("cardmarket_ignored_products" as const);

  for (const p of products) {
    await db
      .deleteFrom(ignoreTable)
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
  const table =
    source === "tcgplayer"
      ? ("tcgplayer_staging_card_overrides" as const)
      : ("cardmarket_staging_card_overrides" as const);

  await db
    .insertInto(table)
    .values({
      external_id: externalId,
      finish,
      card_id: cardId,
    })
    .onConflict((oc) => oc.columns(["external_id", "finish"]).doUpdateSet({ card_id: cardId }))
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
  const table =
    source === "tcgplayer"
      ? ("tcgplayer_staging_card_overrides" as const)
      : ("cardmarket_staging_card_overrides" as const);

  await db
    .deleteFrom(table)
    .where("external_id", "=", externalId)
    .where("finish", "=", finish)
    .execute();

  return c.json({ ok: true });
});
