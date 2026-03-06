import { refreshCardmarketPrices } from "@openrift/shared/db/refresh-cardmarket-prices";
import { refreshCatalog } from "@openrift/shared/db/refresh-catalog";
import { refreshTcgplayerPrices } from "@openrift/shared/db/refresh-tcgplayer-prices";
import { Hono } from "hono";
import { sql } from "kysely";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { cronJobs } from "../cron-jobs.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const adminRoute = new Hono<{ Variables: Variables }>();

// ── GET /admin/cron-status ──────────────────────────────────────────────────

adminRoute.use("/admin/cron-status", requireAdmin);
adminRoute.get("/admin/cron-status", (c) =>
  c.json({
    tcgplayer: cronJobs.tcgplayer
      ? { nextRun: cronJobs.tcgplayer.nextRun()?.toISOString() ?? null }
      : null,
    cardmarket: cronJobs.cardmarket
      ? { nextRun: cronJobs.cardmarket.nextRun()?.toISOString() ?? null }
      : null,
    catalog: null,
  }),
);

// ── GET /admin/me — any authenticated user ───────────────────────────────────

adminRoute.get("/admin/me", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ isAdmin: false });
  }

  const admin = await db
    .selectFrom("admins")
    .select("user_id")
    .where("user_id", "=", user.id)
    .executeTakeFirst();

  return c.json({ isAdmin: Boolean(admin) });
});

// ── TCGPlayer mapping routes ─────────────────────────────────────────────────

function createTcgplayerMappingRoutes(app: typeof adminRoute, path: string) {
  app.use(path, requireAdmin);
  app.use(`${path}/all`, requireAdmin);

  // ── GET ──────────────────────────────────────────────────────────────────

  app.get(path, async (c) => {
    const showAll = c.req.query("all") === "true";

    // 1. Fetch latest staged products, deduplicated by external_id
    const staged = await db
      .selectFrom("tcgplayer_staging")
      .selectAll()
      .orderBy("recorded_at", "desc")
      .execute();

    // Deduplicate by (external_id, finish) — keep latest recorded_at per combo
    const seenStagingKeys = new Set<string>();
    const uniqueStaged = staged.filter((row) => {
      if (row.external_id === null) {
        return false;
      }
      const key = `${row.external_id}::${row.finish}`;
      if (seenStagingKeys.has(key)) {
        return false;
      }
      seenStagingKeys.add(key);
      return true;
    });

    // 2. Normalize helper + collect staged set IDs
    const normalizeName = (name: string) =>
      name
        .toLowerCase()
        .replaceAll(/[^a-z0-9\s]/g, "")
        .replaceAll(/\s+/g, " ")
        .trim();

    const stagedSetIds = [...new Set(uniqueStaged.map((r) => r.set_id).filter(Boolean))];

    // 3. Build the card query — fetch all cards in staged sets
    let query = db
      .selectFrom("cards as c")
      .innerJoin("printings as p", "p.card_id", "c.id")
      .innerJoin("sets as s", "s.id", "p.set_id")
      .leftJoin("tcgplayer_sources as ps", "ps.printing_id", "p.id")
      .select([
        "c.id as card_id",
        "c.name as card_name",
        "c.type as card_type",
        "c.super_types",
        "c.domains",
        "c.energy",
        "c.might",
        "p.id as printing_id",
        "p.set_id",
        "p.source_id",
        "p.rarity",
        "s.name as set_name",
        "p.art_variant",
        "p.is_signed",
        "p.is_promo",
        "p.finish",
        "p.collector_number",
        "p.image_url",
        "ps.external_id",
      ])
      .orderBy("p.set_id")
      .orderBy("c.name")
      .orderBy("p.source_id")
      .orderBy("p.finish", "desc");

    if (showAll) {
      query = query.where((eb) => {
        const conditions = [eb("ps.external_id", "is not", null)];
        if (stagedSetIds.length > 0) {
          conditions.push(eb("p.set_id", "in", stagedSetIds));
        }
        return eb.or(conditions);
      });
    } else {
      if (stagedSetIds.length === 0) {
        return c.json({ groups: [], unmatchedProducts: [] });
      }
      query = query.where("p.set_id", "in", stagedSetIds);
    }

    const matchedCards = await query.execute();

    // 4. Group by card
    const cardGroups = new Map<
      string,
      {
        cardId: string;
        cardName: string;
        cardType: string;
        superTypes: string[];
        domains: string[];
        energy: number | null;
        might: number | null;
        setId: string;
        setName: string;
        printings: {
          printingId: string;
          sourceId: string;
          rarity: string;
          artVariant: string;
          isSigned: boolean;
          isPromo: boolean;
          finish: string;
          collectorNumber: number;
          imageUrl: string;
          externalId: number | null;
        }[];
      }
    >();

    for (const row of matchedCards) {
      const key = `${row.set_id}::${row.card_id}`;
      let group = cardGroups.get(key);
      if (!group) {
        group = {
          cardId: row.card_id,
          cardName: row.card_name,
          cardType: row.card_type,
          superTypes: row.super_types as string[],
          domains: row.domains as string[],
          energy: row.energy,
          might: row.might,
          setId: row.set_id,
          setName: row.set_name,
          printings: [],
        };
        cardGroups.set(key, group);
      }
      group.printings.push({
        printingId: row.printing_id,
        sourceId: row.source_id,
        rarity: row.rarity,
        artVariant: row.art_variant,
        isSigned: row.is_signed,
        isPromo: row.is_promo,
        finish: row.finish,
        collectorNumber: row.collector_number,
        imageUrl: row.image_url,
        externalId: row.external_id,
      });
    }

    // 4b. Prefix-match staged products to card groups
    // Build lookup: for each set, list card names sorted by length desc (longest first)
    const cardNamesBySet = new Map<string, { normName: string; groupKey: string }[]>();
    for (const [key, group] of cardGroups) {
      const list = cardNamesBySet.get(group.setId) ?? [];
      list.push({ normName: normalizeName(group.cardName), groupKey: key });
      cardNamesBySet.set(group.setId, list);
    }
    for (const list of cardNamesBySet.values()) {
      list.sort((a, b) => b.normName.length - a.normName.length);
    }

    const stagedByCard = new Map<string, typeof uniqueStaged>();
    const matchedStagingKeys = new Set<string>();
    for (const row of uniqueStaged) {
      if (!row.set_id) {
        continue;
      }
      const normProduct = normalizeName(row.product_name);
      const candidates = cardNamesBySet.get(row.set_id) ?? [];
      for (const { normName, groupKey } of candidates) {
        if (
          normProduct === normName ||
          (normProduct.startsWith(normName) && normProduct[normName.length] === " ")
        ) {
          const list = stagedByCard.get(groupKey) ?? [];
          list.push(row);
          stagedByCard.set(groupKey, list);
          matchedStagingKeys.add(`${row.external_id}::${row.finish}`);
          break;
        }
      }
    }

    // 5. Collect mapped printing IDs so we can fetch their latest prices
    const mappedPrintingIds = new Set<string>();
    for (const group of cardGroups.values()) {
      for (const p of group.printings) {
        if (p.externalId !== null) {
          mappedPrintingIds.add(p.printingId);
        }
      }
    }

    const mappedProductInfo = new Map<
      string,
      {
        productName: string | null;
        marketCents: number;
        lowCents: number | null;
        currency: string;
        recordedAt: string;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      }
    >();
    if (mappedPrintingIds.size > 0) {
      const mappedRows = await db
        .selectFrom("tcgplayer_sources as ps")
        .innerJoin("tcgplayer_snapshots as snap", "snap.source_id", "ps.id")
        .select([
          "ps.printing_id",
          "ps.product_name",
          "snap.market_cents",
          "snap.low_cents",
          "snap.mid_cents",
          "snap.high_cents",
          "snap.recorded_at",
        ])
        .where("ps.printing_id", "in", [...mappedPrintingIds])
        .orderBy("snap.recorded_at", "desc")
        .execute();

      for (const row of mappedRows) {
        if (!mappedProductInfo.has(row.printing_id)) {
          mappedProductInfo.set(row.printing_id, {
            productName: row.product_name,
            marketCents: row.market_cents,
            lowCents: row.low_cents,
            currency: "USD",
            recordedAt: row.recorded_at.toISOString(),
            midCents: row.mid_cents,
            highCents: row.high_cents,
            trendCents: null,
            avg1Cents: null,
            avg7Cents: null,
            avg30Cents: null,
          });
        }
      }
    }

    // 6. Collect unmatched staged products
    const unmatchedProducts = uniqueStaged
      .filter((row) => !matchedStagingKeys.has(`${row.external_id}::${row.finish}`))
      .map((row) => ({
        externalId: row.external_id ?? "",
        productName: row.product_name,
        finish: row.finish,
        marketCents: row.market_cents,
        lowCents: row.low_cents,
        currency: "USD" as string,
        recordedAt: row.recorded_at.toISOString(),
        midCents: row.mid_cents,
        highCents: row.high_cents,
        trendCents: null as number | null,
        avg1Cents: null as number | null,
        avg7Cents: null as number | null,
        avg30Cents: null as number | null,
      }));

    // 7. Build response
    const groups = [...cardGroups.values()]
      .filter((group) => {
        const key = `${group.setId}::${group.cardId}`;
        if (showAll) {
          return stagedByCard.has(key) || group.printings.some((p) => p.externalId !== null);
        }
        return stagedByCard.has(key);
      })
      .map((group) => {
        const key = `${group.setId}::${group.cardId}`;
        const stagedProducts = (stagedByCard.get(key) ?? []).map((row) => ({
          externalId: row.external_id ?? "",
          productName: row.product_name,
          finish: row.finish,
          marketCents: row.market_cents,
          lowCents: row.low_cents,
          currency: "USD" as string,
          recordedAt: row.recorded_at.toISOString(),
          midCents: row.mid_cents,
          highCents: row.high_cents,
          trendCents: null as number | null,
          avg1Cents: null as number | null,
          avg7Cents: null as number | null,
          avg30Cents: null as number | null,
        }));

        const seenAssigned = new Set<string>();
        const assignedProducts: typeof stagedProducts = [];
        for (const p of group.printings) {
          const dedupKey = `${p.externalId}::${p.finish}`;
          if (p.externalId !== null && !seenAssigned.has(dedupKey)) {
            seenAssigned.add(dedupKey);
            const info = mappedProductInfo.get(p.printingId);
            if (info) {
              assignedProducts.push({
                externalId: p.externalId,
                productName: info.productName ?? group.cardName,
                finish: p.finish,
                marketCents: info.marketCents,
                lowCents: info.lowCents,
                currency: info.currency,
                recordedAt: info.recordedAt,
                midCents: info.midCents,
                highCents: info.highCents,
                trendCents: info.trendCents,
                avg1Cents: info.avg1Cents,
                avg7Cents: info.avg7Cents,
                avg30Cents: info.avg30Cents,
              });
            }
          }
        }

        return {
          ...group,
          stagedProducts,
          assignedProducts,
        };
      });

    return c.json({ groups, unmatchedProducts });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  const saveMappingsSchema = z.object({
    mappings: z.array(
      z.object({
        printingId: z.string(),
        externalId: z.number(),
      }),
    ),
  });

  app.post(path, async (c) => {
    const body = await c.req.json();
    const parsed = saveMappingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
    }

    const { mappings } = parsed.data;
    if (mappings.length === 0) {
      return c.json({ saved: 0 });
    }

    let saved = 0;

    await db.transaction().execute(async (tx) => {
      for (const { printingId, externalId } of mappings) {
        const printing = await tx
          .selectFrom("printings")
          .select("finish")
          .where("id", "=", printingId)
          .executeTakeFirstOrThrow();

        const stagingRows = await tx
          .selectFrom("tcgplayer_staging")
          .selectAll()
          .where("external_id", "=", externalId)
          .where("finish", "=", printing.finish)
          .execute();

        const first = stagingRows[0];

        const ps = await tx
          .insertInto("tcgplayer_sources")
          .values({
            printing_id: printingId,
            external_id: externalId,
            group_id: first?.group_id ?? null,
            product_name: first?.product_name ?? null,
            url: `https://www.tcgplayer.com/product/${externalId}`,
          })
          .onConflict((oc) =>
            oc.column("printing_id").doUpdateSet({
              external_id: externalId,
              group_id: first?.group_id ?? null,
              product_name: first?.product_name ?? null,
              url: `https://www.tcgplayer.com/product/${externalId}`,
              updated_at: new Date(),
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();

        for (const row of stagingRows) {
          await tx
            .insertInto("tcgplayer_snapshots")
            .values({
              source_id: ps.id,
              recorded_at: row.recorded_at,
              market_cents: row.market_cents,
              low_cents: row.low_cents,
              mid_cents: row.mid_cents,
              high_cents: row.high_cents,
            })
            .onConflict((oc) =>
              oc.columns(["source_id", "recorded_at"]).doUpdateSet({
                market_cents: row.market_cents,
                low_cents: row.low_cents,
                mid_cents: row.mid_cents,
                high_cents: row.high_cents,
              }),
            )
            .execute();
        }

        await tx
          .deleteFrom("tcgplayer_staging")
          .where("external_id", "=", externalId)
          .where("finish", "=", printing.finish)
          .execute();

        saved++;
      }
    });

    return c.json({ saved });
  });

  // ── DELETE — unmap a printing, return to staging ─────────────────────────

  const unmapSchema = z.object({
    printingId: z.string(),
  });

  app.delete(path, async (c) => {
    const body = await c.req.json();
    const parsed = unmapSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
    }

    const { printingId } = parsed.data;

    await db.transaction().execute(async (tx) => {
      const ps = await tx
        .selectFrom("tcgplayer_sources")
        .selectAll()
        .where("printing_id", "=", printingId)
        .executeTakeFirst();

      if (!ps || ps.external_id === null) {
        return;
      }

      const printing = await tx
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.card_id")
        .select(["p.set_id", "p.finish", "c.name as card_name"])
        .where("p.id", "=", printingId)
        .executeTakeFirstOrThrow();

      const snapshots = await tx
        .selectFrom("tcgplayer_snapshots")
        .selectAll()
        .where("source_id", "=", ps.id)
        .execute();

      for (const snap of snapshots) {
        await tx
          .insertInto("tcgplayer_staging")
          .values({
            set_id: printing.set_id,
            external_id: ps.external_id,
            product_name: printing.card_name,
            finish: printing.finish,
            recorded_at: snap.recorded_at,
            market_cents: snap.market_cents,
            low_cents: snap.low_cents,
            mid_cents: snap.mid_cents,
            high_cents: snap.high_cents,
          })
          .onConflict((oc) => oc.columns(["external_id", "finish", "recorded_at"]).doNothing())
          .execute();
      }

      await tx.deleteFrom("tcgplayer_snapshots").where("source_id", "=", ps.id).execute();
      await tx.deleteFrom("tcgplayer_sources").where("id", "=", ps.id).execute();
    });

    return c.json({ ok: true });
  });

  // ── DELETE /all — unmap every printing, return all to staging ────────────

  app.delete(`${path}/all`, async (c) => {
    let unmapped = 0;

    const sources = await db
      .selectFrom("tcgplayer_sources")
      .selectAll()
      .where("external_id", "is not", null)
      .execute();

    for (const ps of sources) {
      const externalId = ps.external_id;
      if (externalId === null) {
        continue;
      }

      await db.transaction().execute(async (tx) => {
        const printing = await tx
          .selectFrom("printings as p")
          .innerJoin("cards as c", "c.id", "p.card_id")
          .select(["p.set_id", "p.finish", "c.name as card_name"])
          .where("p.id", "=", ps.printing_id)
          .executeTakeFirstOrThrow();

        const snapshots = await tx
          .selectFrom("tcgplayer_snapshots")
          .selectAll()
          .where("source_id", "=", ps.id)
          .execute();

        for (const snap of snapshots) {
          await tx
            .insertInto("tcgplayer_staging")
            .values({
              set_id: printing.set_id,
              external_id: externalId,
              product_name: printing.card_name,
              finish: printing.finish,
              recorded_at: snap.recorded_at,
              market_cents: snap.market_cents,
              low_cents: snap.low_cents,
              mid_cents: snap.mid_cents,
              high_cents: snap.high_cents,
            })
            .onConflict((oc) => oc.columns(["external_id", "finish", "recorded_at"]).doNothing())
            .execute();
        }

        await tx.deleteFrom("tcgplayer_snapshots").where("source_id", "=", ps.id).execute();
        await tx.deleteFrom("tcgplayer_sources").where("id", "=", ps.id).execute();
      });

      unmapped++;
    }

    return c.json({ ok: true, unmapped });
  });
}

// ── Cardmarket mapping routes ────────────────────────────────────────────────

function createCardmarketMappingRoutes(app: typeof adminRoute, path: string) {
  app.use(path, requireAdmin);
  app.use(`${path}/all`, requireAdmin);

  // ── GET ──────────────────────────────────────────────────────────────────

  app.get(path, async (c) => {
    const showAll = c.req.query("all") === "true";

    const staged = await db
      .selectFrom("cardmarket_staging")
      .selectAll()
      .orderBy("recorded_at", "desc")
      .execute();

    // Deduplicate by (external_id, finish) — keep latest recorded_at per combo
    const seenStagingKeys = new Set<string>();
    const uniqueStaged = staged.filter((row) => {
      if (row.external_id === null) {
        return false;
      }
      const key = `${row.external_id}::${row.finish}`;
      if (seenStagingKeys.has(key)) {
        return false;
      }
      seenStagingKeys.add(key);
      return true;
    });

    const normalizeName = (name: string) =>
      name
        .toLowerCase()
        .replaceAll(/[^a-z0-9\s]/g, "")
        .replaceAll(/\s+/g, " ")
        .trim();

    const stagedSetIds = [...new Set(uniqueStaged.map((r) => r.set_id).filter(Boolean))];

    let query = db
      .selectFrom("cards as c")
      .innerJoin("printings as p", "p.card_id", "c.id")
      .innerJoin("sets as s", "s.id", "p.set_id")
      .leftJoin("cardmarket_sources as ps", "ps.printing_id", "p.id")
      .select([
        "c.id as card_id",
        "c.name as card_name",
        "c.type as card_type",
        "c.super_types",
        "c.domains",
        "c.energy",
        "c.might",
        "p.id as printing_id",
        "p.set_id",
        "p.source_id",
        "p.rarity",
        "s.name as set_name",
        "p.art_variant",
        "p.is_signed",
        "p.is_promo",
        "p.finish",
        "p.collector_number",
        "p.image_url",
        "ps.external_id",
      ])
      .orderBy("p.set_id")
      .orderBy("c.name")
      .orderBy("p.source_id")
      .orderBy("p.finish", "desc");

    if (showAll) {
      query = query.where((eb) => {
        const conditions = [eb("ps.external_id", "is not", null)];
        if (stagedSetIds.length > 0) {
          conditions.push(eb("p.set_id", "in", stagedSetIds));
        }
        return eb.or(conditions);
      });
    } else {
      if (stagedSetIds.length === 0) {
        return c.json({ groups: [], unmatchedProducts: [] });
      }
      query = query.where("p.set_id", "in", stagedSetIds);
    }

    const matchedCards = await query.execute();

    const cardGroups = new Map<
      string,
      {
        cardId: string;
        cardName: string;
        cardType: string;
        superTypes: string[];
        domains: string[];
        energy: number | null;
        might: number | null;
        setId: string;
        setName: string;
        printings: {
          printingId: string;
          sourceId: string;
          rarity: string;
          artVariant: string;
          isSigned: boolean;
          isPromo: boolean;
          finish: string;
          collectorNumber: number;
          imageUrl: string;
          externalId: number | null;
        }[];
      }
    >();

    for (const row of matchedCards) {
      const key = `${row.set_id}::${row.card_id}`;
      let group = cardGroups.get(key);
      if (!group) {
        group = {
          cardId: row.card_id,
          cardName: row.card_name,
          cardType: row.card_type,
          superTypes: row.super_types as string[],
          domains: row.domains as string[],
          energy: row.energy,
          might: row.might,
          setId: row.set_id,
          setName: row.set_name,
          printings: [],
        };
        cardGroups.set(key, group);
      }
      group.printings.push({
        printingId: row.printing_id,
        sourceId: row.source_id,
        rarity: row.rarity,
        artVariant: row.art_variant,
        isSigned: row.is_signed,
        isPromo: row.is_promo,
        finish: row.finish,
        collectorNumber: row.collector_number,
        imageUrl: row.image_url,
        externalId: row.external_id,
      });
    }

    // Prefix-match staged products to card groups
    const cardNamesBySet = new Map<string, { normName: string; groupKey: string }[]>();
    for (const [key, group] of cardGroups) {
      const list = cardNamesBySet.get(group.setId) ?? [];
      list.push({ normName: normalizeName(group.cardName), groupKey: key });
      cardNamesBySet.set(group.setId, list);
    }
    for (const list of cardNamesBySet.values()) {
      list.sort((a, b) => b.normName.length - a.normName.length);
    }

    const stagedByCard = new Map<string, typeof uniqueStaged>();
    const matchedStagingKeys = new Set<string>();
    for (const row of uniqueStaged) {
      if (!row.set_id) {
        continue;
      }
      const normProduct = normalizeName(row.product_name);
      const candidates = cardNamesBySet.get(row.set_id) ?? [];
      for (const { normName, groupKey } of candidates) {
        if (
          normProduct === normName ||
          (normProduct.startsWith(normName) && normProduct[normName.length] === " ")
        ) {
          const list = stagedByCard.get(groupKey) ?? [];
          list.push(row);
          stagedByCard.set(groupKey, list);
          matchedStagingKeys.add(`${row.external_id}::${row.finish}`);
          break;
        }
      }
    }

    const mappedPrintingIds = new Set<string>();
    for (const group of cardGroups.values()) {
      for (const p of group.printings) {
        if (p.externalId !== null) {
          mappedPrintingIds.add(p.printingId);
        }
      }
    }

    const mappedProductInfo = new Map<
      string,
      {
        productName: string | null;
        marketCents: number;
        lowCents: number | null;
        currency: string;
        recordedAt: string;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      }
    >();
    if (mappedPrintingIds.size > 0) {
      const mappedRows = await db
        .selectFrom("cardmarket_sources as ps")
        .innerJoin("cardmarket_snapshots as snap", "snap.source_id", "ps.id")
        .select([
          "ps.printing_id",
          "ps.product_name",
          "snap.market_cents",
          "snap.low_cents",
          "snap.trend_cents",
          "snap.avg1_cents",
          "snap.avg7_cents",
          "snap.avg30_cents",
          "snap.recorded_at",
        ])
        .where("ps.printing_id", "in", [...mappedPrintingIds])
        .orderBy("snap.recorded_at", "desc")
        .execute();

      for (const row of mappedRows) {
        if (!mappedProductInfo.has(row.printing_id)) {
          mappedProductInfo.set(row.printing_id, {
            productName: row.product_name,
            marketCents: row.market_cents,
            lowCents: row.low_cents,
            currency: "EUR",
            recordedAt: row.recorded_at.toISOString(),
            midCents: null,
            highCents: null,
            trendCents: row.trend_cents,
            avg1Cents: row.avg1_cents,
            avg7Cents: row.avg7_cents,
            avg30Cents: row.avg30_cents,
          });
        }
      }
    }

    const unmatchedProducts = uniqueStaged
      .filter((row) => !matchedStagingKeys.has(`${row.external_id}::${row.finish}`))
      .map((row) => ({
        externalId: row.external_id ?? "",
        productName: row.product_name,
        finish: row.finish,
        marketCents: row.market_cents,
        lowCents: row.low_cents,
        currency: "EUR" as string,
        recordedAt: row.recorded_at.toISOString(),
        midCents: null as number | null,
        highCents: null as number | null,
        trendCents: row.trend_cents,
        avg1Cents: row.avg1_cents,
        avg7Cents: row.avg7_cents,
        avg30Cents: row.avg30_cents,
      }));

    const groups = [...cardGroups.values()]
      .filter((group) => {
        const key = `${group.setId}::${group.cardId}`;
        if (showAll) {
          return stagedByCard.has(key) || group.printings.some((p) => p.externalId !== null);
        }
        return stagedByCard.has(key);
      })
      .map((group) => {
        const key = `${group.setId}::${group.cardId}`;
        const stagedProducts = (stagedByCard.get(key) ?? []).map((row) => ({
          externalId: row.external_id ?? "",
          productName: row.product_name,
          finish: row.finish,
          marketCents: row.market_cents,
          lowCents: row.low_cents,
          currency: "EUR" as string,
          recordedAt: row.recorded_at.toISOString(),
          midCents: null as number | null,
          highCents: null as number | null,
          trendCents: row.trend_cents,
          avg1Cents: row.avg1_cents,
          avg7Cents: row.avg7_cents,
          avg30Cents: row.avg30_cents,
        }));

        const seenAssigned = new Set<string>();
        const assignedProducts: typeof stagedProducts = [];
        for (const p of group.printings) {
          const dedupKey = `${p.externalId}::${p.finish}`;
          if (p.externalId !== null && !seenAssigned.has(dedupKey)) {
            seenAssigned.add(dedupKey);
            const info = mappedProductInfo.get(p.printingId);
            if (info) {
              assignedProducts.push({
                externalId: p.externalId,
                productName: info.productName ?? group.cardName,
                finish: p.finish,
                marketCents: info.marketCents,
                lowCents: info.lowCents,
                currency: info.currency,
                recordedAt: info.recordedAt,
                midCents: info.midCents,
                highCents: info.highCents,
                trendCents: info.trendCents,
                avg1Cents: info.avg1Cents,
                avg7Cents: info.avg7Cents,
                avg30Cents: info.avg30Cents,
              });
            }
          }
        }

        return {
          ...group,
          stagedProducts,
          assignedProducts,
        };
      });

    return c.json({ groups, unmatchedProducts });
  });

  // ── POST ─────────────────────────────────────────────────────────────────

  const saveMappingsSchema = z.object({
    mappings: z.array(
      z.object({
        printingId: z.string(),
        externalId: z.number(),
      }),
    ),
  });

  app.post(path, async (c) => {
    const body = await c.req.json();
    const parsed = saveMappingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
    }

    const { mappings } = parsed.data;
    if (mappings.length === 0) {
      return c.json({ saved: 0 });
    }

    let saved = 0;

    await db.transaction().execute(async (tx) => {
      for (const { printingId, externalId } of mappings) {
        const printing = await tx
          .selectFrom("printings")
          .select("finish")
          .where("id", "=", printingId)
          .executeTakeFirstOrThrow();

        const stagingRows = await tx
          .selectFrom("cardmarket_staging")
          .selectAll()
          .where("external_id", "=", externalId)
          .where("finish", "=", printing.finish)
          .execute();

        const first = stagingRows[0];

        const ps = await tx
          .insertInto("cardmarket_sources")
          .values({
            printing_id: printingId,
            external_id: externalId,
            group_id: first?.group_id ?? null,
            product_name: first?.product_name ?? null,
            url: `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${externalId}`,
          })
          .onConflict((oc) =>
            oc.column("printing_id").doUpdateSet({
              external_id: externalId,
              group_id: first?.group_id ?? null,
              product_name: first?.product_name ?? null,
              url: `https://www.cardmarket.com/en/Riftbound/Products?idProduct=${externalId}`,
              updated_at: new Date(),
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();

        for (const row of stagingRows) {
          await tx
            .insertInto("cardmarket_snapshots")
            .values({
              source_id: ps.id,
              recorded_at: row.recorded_at,
              market_cents: row.market_cents,
              low_cents: row.low_cents,
              trend_cents: row.trend_cents,
              avg1_cents: row.avg1_cents,
              avg7_cents: row.avg7_cents,
              avg30_cents: row.avg30_cents,
            })
            .onConflict((oc) =>
              oc.columns(["source_id", "recorded_at"]).doUpdateSet({
                market_cents: row.market_cents,
                low_cents: row.low_cents,
                trend_cents: row.trend_cents,
                avg1_cents: row.avg1_cents,
                avg7_cents: row.avg7_cents,
                avg30_cents: row.avg30_cents,
              }),
            )
            .execute();
        }

        await tx
          .deleteFrom("cardmarket_staging")
          .where("external_id", "=", externalId)
          .where("finish", "=", printing.finish)
          .execute();

        saved++;
      }
    });

    return c.json({ saved });
  });

  // ── DELETE — unmap a printing, return to staging ─────────────────────────

  const unmapSchema = z.object({
    printingId: z.string(),
  });

  app.delete(path, async (c) => {
    const body = await c.req.json();
    const parsed = unmapSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
    }

    const { printingId } = parsed.data;

    await db.transaction().execute(async (tx) => {
      const ps = await tx
        .selectFrom("cardmarket_sources")
        .selectAll()
        .where("printing_id", "=", printingId)
        .executeTakeFirst();

      if (!ps || ps.external_id === null) {
        return;
      }

      const printing = await tx
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.card_id")
        .select(["p.set_id", "p.finish", "c.name as card_name"])
        .where("p.id", "=", printingId)
        .executeTakeFirstOrThrow();

      const snapshots = await tx
        .selectFrom("cardmarket_snapshots")
        .selectAll()
        .where("source_id", "=", ps.id)
        .execute();

      for (const snap of snapshots) {
        await tx
          .insertInto("cardmarket_staging")
          .values({
            set_id: printing.set_id,
            external_id: ps.external_id,
            product_name: printing.card_name,
            finish: printing.finish,
            recorded_at: snap.recorded_at,
            market_cents: snap.market_cents,
            low_cents: snap.low_cents,
            trend_cents: snap.trend_cents,
            avg1_cents: snap.avg1_cents,
            avg7_cents: snap.avg7_cents,
            avg30_cents: snap.avg30_cents,
          })
          .onConflict((oc) => oc.columns(["external_id", "finish", "recorded_at"]).doNothing())
          .execute();
      }

      await tx.deleteFrom("cardmarket_snapshots").where("source_id", "=", ps.id).execute();
      await tx.deleteFrom("cardmarket_sources").where("id", "=", ps.id).execute();
    });

    return c.json({ ok: true });
  });

  // ── DELETE /all — unmap every printing, return all to staging ────────────

  app.delete(`${path}/all`, async (c) => {
    let unmapped = 0;

    const sources = await db
      .selectFrom("cardmarket_sources")
      .selectAll()
      .where("external_id", "is not", null)
      .execute();

    for (const ps of sources) {
      const externalId = ps.external_id;
      if (externalId === null) {
        continue;
      }

      await db.transaction().execute(async (tx) => {
        const printing = await tx
          .selectFrom("printings as p")
          .innerJoin("cards as c", "c.id", "p.card_id")
          .select(["p.set_id", "p.finish", "c.name as card_name"])
          .where("p.id", "=", ps.printing_id)
          .executeTakeFirstOrThrow();

        const snapshots = await tx
          .selectFrom("cardmarket_snapshots")
          .selectAll()
          .where("source_id", "=", ps.id)
          .execute();

        for (const snap of snapshots) {
          await tx
            .insertInto("cardmarket_staging")
            .values({
              set_id: printing.set_id,
              external_id: externalId,
              product_name: printing.card_name,
              finish: printing.finish,
              recorded_at: snap.recorded_at,
              market_cents: snap.market_cents,
              low_cents: snap.low_cents,
              trend_cents: snap.trend_cents,
              avg1_cents: snap.avg1_cents,
              avg7_cents: snap.avg7_cents,
              avg30_cents: snap.avg30_cents,
            })
            .onConflict((oc) => oc.columns(["external_id", "finish", "recorded_at"]).doNothing())
            .execute();
        }

        await tx.deleteFrom("cardmarket_snapshots").where("source_id", "=", ps.id).execute();
        await tx.deleteFrom("cardmarket_sources").where("id", "=", ps.id).execute();
      });

      unmapped++;
    }

    return c.json({ ok: true, unmapped });
  });
}

// ── Register mapping routes for each source ─────────────────────────────────

createCardmarketMappingRoutes(adminRoute, "/admin/cm-mappings");
createTcgplayerMappingRoutes(adminRoute, "/admin/tcgplayer-mappings");

// ── Cardmarket Expansions ────────────────────────────────────────────────────

adminRoute.use("/admin/cardmarket-expansions", requireAdmin);

adminRoute.get("/admin/cardmarket-expansions", async (c) => {
  const expansions = await db
    .selectFrom("cardmarket_expansions as ce")
    .leftJoin("sets as s", "s.id", "ce.set_id")
    .select(["ce.expansion_id", "ce.set_id", "s.name as set_name"])
    .orderBy("ce.expansion_id")
    .execute();

  // Count staging rows per expansion (group_id stores idExpansion for cardmarket)
  const stagingCounts = await db
    .selectFrom("cardmarket_staging")
    .select(["group_id", sql<number>`count(DISTINCT external_id)::int`.as("count")])
    .where("group_id", "is not", null)
    .groupBy("group_id")
    .execute();

  const countMap = new Map(stagingCounts.map((r) => [r.group_id, r.count]));

  // Count assigned (mapped) products per expansion
  const assignedCounts = await db
    .selectFrom("cardmarket_sources")
    .select(["group_id", sql<number>`count(*)::int`.as("count")])
    .where("group_id", "is not", null)
    .groupBy("group_id")
    .execute();

  const assignedMap = new Map(assignedCounts.map((r) => [r.group_id, r.count]));

  const sets = await db.selectFrom("sets").select(["id", "name"]).orderBy("name").execute();

  return c.json({
    expansions: expansions.map((e) => ({
      expansionId: e.expansion_id,
      setId: e.set_id,
      setName: e.set_name,
      stagedCount: countMap.get(e.expansion_id) ?? 0,
      assignedCount: assignedMap.get(e.expansion_id) ?? 0,
    })),
    sets: sets.map((s) => ({ id: s.id, name: s.name })),
  });
});

const updateExpansionSchema = z.object({
  expansionId: z.number(),
  setId: z.string().nullable(),
});

adminRoute.put("/admin/cardmarket-expansions", async (c) => {
  const body = await c.req.json();
  const parsed = updateExpansionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
  }

  const { expansionId, setId } = parsed.data;

  await db.transaction().execute(async (tx) => {
    await tx
      .updateTable("cardmarket_expansions")
      .set({ set_id: setId, updated_at: new Date() })
      .where("expansion_id", "=", expansionId)
      .execute();

    // Backfill set_id on staged rows so they appear on the mappings page
    await tx
      .updateTable("cardmarket_staging")
      .set({ set_id: setId })
      .where("group_id", "=", expansionId)
      .execute();
  });

  return c.json({ ok: true });
});

// ── TCGPlayer Groups ─────────────────────────────────────────────────────────

adminRoute.use("/admin/tcgplayer-groups", requireAdmin);

adminRoute.get("/admin/tcgplayer-groups", async (c) => {
  const groups = await db
    .selectFrom("tcgplayer_groups as tg")
    .leftJoin("sets as s", "s.id", "tg.set_id")
    .select(["tg.group_id", "tg.name", "tg.abbreviation", "tg.set_id", "s.name as set_name"])
    .orderBy("tg.name")
    .execute();

  // Count staging rows per group_id
  const stagingCounts = await db
    .selectFrom("tcgplayer_staging")
    .select(["group_id", sql<number>`count(DISTINCT external_id)::int`.as("count")])
    .where("group_id", "is not", null)
    .groupBy("group_id")
    .execute();

  const countMap = new Map(stagingCounts.map((r) => [r.group_id, r.count]));

  // Count assigned (mapped) products per group_id
  const assignedCounts = await db
    .selectFrom("tcgplayer_sources")
    .select(["group_id", sql<number>`count(*)::int`.as("count")])
    .where("group_id", "is not", null)
    .groupBy("group_id")
    .execute();

  const assignedMap = new Map(assignedCounts.map((r) => [r.group_id, r.count]));

  const sets = await db.selectFrom("sets").select(["id", "name"]).orderBy("name").execute();

  return c.json({
    groups: groups.map((g) => ({
      groupId: g.group_id,
      name: g.name,
      abbreviation: g.abbreviation,
      setId: g.set_id,
      setName: g.set_name,
      stagedCount: countMap.get(g.group_id) ?? 0,
      assignedCount: assignedMap.get(g.group_id) ?? 0,
    })),
    sets: sets.map((s) => ({ id: s.id, name: s.name })),
  });
});

const updateGroupSchema = z.object({
  groupId: z.number(),
  setId: z.string().nullable(),
});

adminRoute.put("/admin/tcgplayer-groups", async (c) => {
  const body = await c.req.json();
  const parsed = updateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
  }

  const { groupId, setId } = parsed.data;

  await db.transaction().execute(async (tx) => {
    await tx
      .updateTable("tcgplayer_groups")
      .set({ set_id: setId, updated_at: new Date() })
      .where("group_id", "=", groupId)
      .execute();

    // Backfill set_id on staged rows so they appear on the mappings page
    await tx
      .updateTable("tcgplayer_staging")
      .set({ set_id: setId })
      .where("group_id", "=", groupId)
      .execute();
  });

  return c.json({ ok: true });
});

// ── Sets CRUD ─────────────────────────────────────────────────────────────────

adminRoute.use("/admin/sets", requireAdmin);

adminRoute.get("/admin/sets", async (c) => {
  const sets = await db.selectFrom("sets").selectAll().orderBy("name").execute();

  const cardCounts = await db
    .selectFrom("printings")
    .select(["set_id", sql<number>`count(DISTINCT card_id)::int`.as("card_count")])
    .groupBy("set_id")
    .execute();

  const printingCounts = await db
    .selectFrom("printings")
    .select(["set_id", sql<number>`count(*)::int`.as("printing_count")])
    .groupBy("set_id")
    .execute();

  const cardCountMap = new Map(cardCounts.map((r) => [r.set_id, r.card_count]));
  const printingCountMap = new Map(printingCounts.map((r) => [r.set_id, r.printing_count]));

  return c.json({
    sets: sets.map((s) => ({
      id: s.id,
      name: s.name,
      printedTotal: s.printed_total,
      cardCount: cardCountMap.get(s.id) ?? 0,
      printingCount: printingCountMap.get(s.id) ?? 0,
    })),
  });
});

const updateSetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0),
});

adminRoute.put("/admin/sets", async (c) => {
  const body = await c.req.json();
  const parsed = updateSetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
  }

  const { id, name, printedTotal } = parsed.data;

  await db
    .updateTable("sets")
    .set({ name, printed_total: printedTotal, updated_at: new Date() })
    .where("id", "=", id)
    .execute();

  return c.json({ ok: true });
});

const createSetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  printedTotal: z.number().int().min(0),
});

adminRoute.post("/admin/sets", async (c) => {
  const body = await c.req.json();
  const parsed = createSetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
  }

  const { id, name, printedTotal } = parsed.data;

  const existing = await db.selectFrom("sets").select("id").where("id", "=", id).executeTakeFirst();

  if (existing) {
    return c.json({ error: `Set with ID "${id}" already exists` }, 409);
  }

  await db.insertInto("sets").values({ id, name, printed_total: printedTotal }).execute();

  return c.json({ ok: true });
});

// ── Manual refresh endpoints ────────────────────────────────────────────────

adminRoute.use("/admin/refresh-catalog", requireAdmin);
adminRoute.post("/admin/refresh-catalog", async (c) => {
  try {
    await refreshCatalog(db);
    return c.json({ status: "ok" });
  } catch (error) {
    console.error("[admin] refresh-catalog failed:", error);
    return c.json({ error: "Catalog refresh failed" }, 500);
  }
});

adminRoute.use("/admin/refresh-tcgplayer-prices", requireAdmin);
adminRoute.post("/admin/refresh-tcgplayer-prices", async (c) => {
  try {
    await refreshTcgplayerPrices(db);
    return c.json({ status: "ok" });
  } catch (error) {
    console.error("[admin] refresh-tcgplayer-prices failed:", error);
    return c.json({ error: "TCGPlayer price refresh failed" }, 500);
  }
});

adminRoute.use("/admin/refresh-cardmarket-prices", requireAdmin);
adminRoute.post("/admin/refresh-cardmarket-prices", async (c) => {
  try {
    await refreshCardmarketPrices(db);
    return c.json({ status: "ok" });
  } catch (error) {
    console.error("[admin] refresh-cardmarket-prices failed:", error);
    return c.json({ error: "Cardmarket price refresh failed" }, 500);
  }
});
