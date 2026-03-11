import type { Database } from "@openrift/shared/db";
import type { Hono } from "hono";
import type { Transaction } from "kysely";
import { sql } from "kysely";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { imageUrl } from "../../db-helpers.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";

// ── Unified product-info shape consumed by the frontend ─────────────────────

interface ProductInfo {
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

// ── Marketplace-specific config ─────────────────────────────────────────────

interface MarketplaceConfig {
  currency: string;
  tables: {
    staging: "tcgplayer_staging" | "cardmarket_staging";
    sources: "tcgplayer_sources" | "cardmarket_sources";
    snapshots: "tcgplayer_snapshots" | "cardmarket_snapshots";
    groups: "tcgplayer_groups" | "cardmarket_expansions";
    ignored: "tcgplayer_ignored_products" | "cardmarket_ignored_products";
    overrides: "tcgplayer_staging_card_overrides" | "cardmarket_staging_card_overrides";
  };
  /** Column name that holds the group/expansion ID in the groups table */
  groupIdColumn: "group_id" | "expansion_id";
  /** Map a staging row → the unified product-info price fields */
  mapStagingPrices: (row: StagingRow) => Omit<ProductInfo, "productName" | "recordedAt">;
  /** Select + map snapshot prices for mapped products */
  snapshotQuery: (printingIds: string[]) => Promise<MappedSnapshotRow[]>;
  /** Map a snapshot query result → unified product-info */
  mapSnapshotPrices: (row: MappedSnapshotRow) => ProductInfo;
  /** Insert a snapshot row from staging during the POST (map) operation */
  insertSnapshot: (tx: Transaction<Database>, sourceId: number, row: StagingRow) => Promise<void>;
  /** Insert a staging row from a snapshot during the DELETE (unmap) operation */
  insertStagingFromSnapshot: (
    tx: Transaction<Database>,
    ps: { external_id: number; group_id: number; product_name: string },
    finish: string,
    snap: SnapshotRow,
  ) => Promise<void>;
  /** Raw SQL to bulk-copy all snapshots back to staging (DELETE /all) */
  bulkUnmapSql: (tx: Transaction<Database>) => Promise<void>;
}

// Row shapes used by the config callbacks (kept loose so both marketplaces fit)
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- generic row from selectAll()
type StagingRow = Record<string, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- generic row from selectAll()
type SnapshotRow = Record<string, any>;
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- generic row from snapshot query
type MappedSnapshotRow = Record<string, any>;

// ── Shared helpers ──────────────────────────────────────────────────────────

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

// ── Route factory ───────────────────────────────────────────────────────────

export function createMappingRoutes(
  app: Hono<{ Variables: Variables }>,
  path: string,
  config: MarketplaceConfig,
) {
  app.use(path, requireAdmin);
  app.use(`${path}/all`, requireAdmin);

  // ── GET — build mapping overview ────────────────────────────────────────

  app.get(path, async (c) => {
    const showAll = c.req.query("all") === "true";

    // 1. Load ignored products
    const ignoredRows = await db
      .selectFrom(config.tables.ignored)
      .select(["external_id", "finish", "product_name", "created_at"])
      .execute();
    const ignoredKeys = new Set(ignoredRows.map((r) => `${r.external_id}::${r.finish}`));

    // 2. Fetch & deduplicate staged products
    const staged = await db
      .selectFrom(config.tables.staging)
      .selectAll()
      .orderBy("recorded_at", "desc")
      .execute();

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

    // 3. Resolve group/expansion → set mapping
    const groupRows = await db
      .selectFrom(config.tables.groups)
      .select([`${config.groupIdColumn} as gid`, "set_id"])
      .execute();
    const groupSetMap = new Map<number, string>();
    for (const row of groupRows) {
      if (row.set_id) {
        groupSetMap.set(row.gid as number, row.set_id);
      }
    }

    const stagedSetIds = [
      ...new Set(
        uniqueStaged
          .map((r) => (r.group_id === null ? undefined : groupSetMap.get(r.group_id)))
          .filter((id): id is string => id !== undefined),
      ),
    ];

    // 4. Build card query — all cards in staged sets
    let query = db
      .selectFrom("cards as c")
      .innerJoin("printings as p", "p.card_id", "c.id")
      .innerJoin("sets as s", "s.id", "p.set_id")
      .leftJoin(`${config.tables.sources} as ps`, "ps.printing_id", "p.id")
      .leftJoin("printing_images as pi", (join) =>
        join
          .onRef("pi.printing_id", "=", "p.id")
          .on("pi.face", "=", "front")
          .on("pi.is_active", "=", true),
      )
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
        imageUrl("pi").as("image_url"),
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

    // 5. Group by card
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
          imageUrl: string | null;
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

    // 5b. Prefix-match staged products to card groups
    const cardNamesBySet = new Map<string, { normName: string; groupKey: string }[]>();
    for (const [key, group] of cardGroups) {
      const list = cardNamesBySet.get(group.setId) ?? [];
      list.push({ normName: normalizeName(group.cardName), groupKey: key });
      cardNamesBySet.set(group.setId, list);
    }
    for (const list of cardNamesBySet.values()) {
      list.sort((a, b) => b.normName.length - a.normName.length);
    }

    // 5c. Load manual card overrides
    const overrideRows = await db
      .selectFrom(config.tables.overrides)
      .select(["external_id", "finish", "card_id", "set_id"])
      .execute();
    const overrideMap = new Map<string, { cardId: string; setId: string }>();
    for (const row of overrideRows) {
      overrideMap.set(`${row.external_id}::${row.finish}`, {
        cardId: row.card_id,
        setId: row.set_id,
      });
    }

    const stagedByCard = new Map<string, typeof uniqueStaged>();
    const matchedStagingKeys = new Set<string>();
    for (const row of uniqueStaged) {
      const stagingKey = `${row.external_id}::${row.finish}`;

      // Check manual override first
      const override = overrideMap.get(stagingKey);
      if (override) {
        const groupKey = `${override.setId}::${override.cardId}`;
        if (cardGroups.has(groupKey)) {
          const list = stagedByCard.get(groupKey) ?? [];
          list.push(row);
          stagedByCard.set(groupKey, list);
          matchedStagingKeys.add(stagingKey);
          continue;
        }
      }

      // Fall back to prefix matching
      const setId = row.group_id === null ? undefined : groupSetMap.get(row.group_id);
      if (!setId) {
        continue;
      }
      const normProduct = normalizeName(row.product_name);
      const candidates = cardNamesBySet.get(setId) ?? [];
      for (const { normName, groupKey } of candidates) {
        if (
          normProduct === normName ||
          (normProduct.startsWith(normName) && normProduct[normName.length] === " ")
        ) {
          const list = stagedByCard.get(groupKey) ?? [];
          list.push(row);
          stagedByCard.set(groupKey, list);
          matchedStagingKeys.add(stagingKey);
          break;
        }
      }
    }

    // 6. Fetch latest prices for already-mapped printings
    const mappedPrintingIds = new Set<string>();
    for (const group of cardGroups.values()) {
      for (const p of group.printings) {
        if (p.externalId !== null) {
          mappedPrintingIds.add(p.printingId);
        }
      }
    }

    const mappedProductInfo = new Map<string, ProductInfo>();
    if (mappedPrintingIds.size > 0) {
      const mappedRows = await config.snapshotQuery([...mappedPrintingIds]);
      for (const row of mappedRows) {
        if (!mappedProductInfo.has(row.printing_id)) {
          mappedProductInfo.set(row.printing_id, config.mapSnapshotPrices(row));
        }
      }
    }

    // 7. Map staged rows to product format
    const mapStagedRow = (row: StagingRow, opts?: { isOverride?: boolean }) => ({
      externalId: row.external_id ?? "",
      productName: row.product_name,
      finish: row.finish,
      ...config.mapStagingPrices(row),
      recordedAt: row.recorded_at.toISOString(),
      ...(opts?.isOverride === undefined ? {} : { isOverride: opts.isOverride }),
    });

    // Unmatched products (excluding ignored)
    const unmatchedProducts = uniqueStaged
      .filter(
        (row) =>
          !matchedStagingKeys.has(`${row.external_id}::${row.finish}`) &&
          !ignoredKeys.has(`${row.external_id}::${row.finish}`),
      )
      .map((row) => mapStagedRow(row));

    // Ignored products
    const ignoredProducts = ignoredRows.map((r) => ({
      externalId: r.external_id,
      productName: r.product_name,
      finish: r.finish,
      marketCents: 0,
      lowCents: null as number | null,
      currency: config.currency,
      recordedAt: r.created_at.toISOString(),
      midCents: null as number | null,
      highCents: null as number | null,
      trendCents: null as number | null,
      avg1Cents: null as number | null,
      avg7Cents: null as number | null,
      avg30Cents: null as number | null,
    }));

    // 8. Build response groups
    const groups = [...cardGroups.values()]
      .filter((group) => {
        const key = `${group.setId}::${group.cardId}`;
        const hasStaged = stagedByCard.has(key);
        const hasUnmapped = group.printings.some((p) => p.externalId === null);
        if (showAll) {
          return true;
        }
        return hasStaged || hasUnmapped;
      })
      .map((group) => {
        const key = `${group.setId}::${group.cardId}`;
        const stagedProducts = (stagedByCard.get(key) ?? []).map((row) =>
          mapStagedRow(row, { isOverride: overrideMap.has(`${row.external_id}::${row.finish}`) }),
        );

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
                isOverride: false,
              });
            }
          }
        }

        // Exclude staged products that are already assigned
        const assignedKeys = new Set(assignedProducts.map((p) => `${p.externalId}::${p.finish}`));
        const filteredStaged = stagedProducts.filter(
          (p) => !assignedKeys.has(`${p.externalId}::${p.finish}`),
        );

        return {
          ...group,
          stagedProducts: filteredStaged,
          assignedProducts,
        };
      });

    // Lightweight card list for manual assignment
    const allCards = [...cardGroups.values()].map((g) => ({
      cardId: g.cardId,
      cardName: g.cardName,
      setId: g.setId,
      setName: g.setName,
      printings: g.printings.map((p) => ({
        printingId: p.printingId,
        sourceId: p.sourceId,
        finish: p.finish,
        collectorNumber: p.collectorNumber,
        isSigned: p.isSigned,
        isPromo: p.isPromo,
        externalId: p.externalId,
      })),
    }));

    return c.json({ groups, unmatchedProducts, ignoredProducts, allCards });
  });

  // ── POST — save mappings ──────────────────────────────────────────────────

  const saveMappingsSchema = z.object({
    mappings: z.array(
      z.object({
        printingId: z.string(),
        externalId: z.number(),
      }),
    ),
  });

  app.post(path, async (c) => {
    const { mappings } = saveMappingsSchema.parse(await c.req.json());
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
          .selectFrom(config.tables.staging)
          .selectAll()
          .where("external_id", "=", externalId)
          .where("finish", "=", printing.finish)
          .execute();

        const first = stagingRows[0];
        if (!first) {
          continue;
        }

        const ps = await tx
          .insertInto(config.tables.sources)
          .values({
            printing_id: printingId,
            external_id: externalId,
            group_id: first.group_id,
            product_name: first.product_name,
          })
          .onConflict((oc) =>
            oc.column("printing_id").doUpdateSet({
              external_id: externalId,
              group_id: first.group_id,
              product_name: first.product_name,
              updated_at: new Date(),
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();

        for (const row of stagingRows) {
          await config.insertSnapshot(tx, ps.id, row);
        }

        await tx
          .deleteFrom(config.tables.staging)
          .where("external_id", "=", externalId)
          .where("finish", "=", printing.finish)
          .execute();

        saved++;
      }
    });

    return c.json({ saved });
  });

  // ── DELETE — unmap a printing, return to staging ──────────────────────────

  const unmapSchema = z.object({
    printingId: z.string(),
  });

  app.delete(path, async (c) => {
    const { printingId } = unmapSchema.parse(await c.req.json());

    await db.transaction().execute(async (tx) => {
      const ps = await tx
        .selectFrom(config.tables.sources)
        .selectAll()
        .where("printing_id", "=", printingId)
        .executeTakeFirst();

      if (!ps || ps.external_id === null) {
        return;
      }

      const printing = await tx
        .selectFrom("printings")
        .select("finish")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();

      const snapshots = await tx
        .selectFrom(config.tables.snapshots)
        .selectAll()
        .where("source_id", "=", ps.id)
        .execute();

      for (const snap of snapshots) {
        await config.insertStagingFromSnapshot(tx, ps, printing.finish, snap);
      }

      await tx.deleteFrom(config.tables.snapshots).where("source_id", "=", ps.id).execute();
      await tx.deleteFrom(config.tables.sources).where("id", "=", ps.id).execute();
    });

    return c.json({ ok: true });
  });

  // ── DELETE /all — unmap every printing, return all to staging ──────────

  app.delete(`${path}/all`, async (c) => {
    const result = await db.transaction().execute(async (tx) => {
      await config.bulkUnmapSql(tx);

      const countResult = await tx
        .selectFrom(config.tables.sources)
        .select(sql<number>`count(*)`.as("count"))
        .where("external_id", "is not", null)
        .executeTakeFirstOrThrow();

      await sql`
        DELETE FROM ${sql.table(config.tables.snapshots)}
        WHERE source_id IN (SELECT id FROM ${sql.table(config.tables.sources)} WHERE external_id IS NOT NULL)
      `.execute(tx);

      await tx.deleteFrom(config.tables.sources).where("external_id", "is not", null).execute();

      return Number(countResult.count);
    });

    return c.json({ ok: true, unmapped: result });
  });
}

// ── TCGPlayer config ────────────────────────────────────────────────────────

export const tcgplayerConfig: MarketplaceConfig = {
  currency: "USD",
  tables: {
    staging: "tcgplayer_staging",
    sources: "tcgplayer_sources",
    snapshots: "tcgplayer_snapshots",
    groups: "tcgplayer_groups",
    ignored: "tcgplayer_ignored_products",
    overrides: "tcgplayer_staging_card_overrides",
  },
  groupIdColumn: "group_id",

  mapStagingPrices: (row) => ({
    marketCents: row.market_cents,
    lowCents: row.low_cents,
    currency: "USD",
    midCents: row.mid_cents,
    highCents: row.high_cents,
    trendCents: null,
    avg1Cents: null,
    avg7Cents: null,
    avg30Cents: null,
  }),

  snapshotQuery: (printingIds) =>
    db
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
      .where("ps.printing_id", "in", printingIds)
      .orderBy("snap.recorded_at", "desc")
      .execute(),

  mapSnapshotPrices: (row) => ({
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
  }),

  insertSnapshot: async (tx, sourceId, row) => {
    await tx
      .insertInto("tcgplayer_snapshots")
      .values({
        source_id: sourceId,
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
  },

  insertStagingFromSnapshot: async (tx, ps, finish, snap) => {
    await tx
      .insertInto("tcgplayer_staging")
      .values({
        external_id: ps.external_id,
        group_id: ps.group_id,
        product_name: ps.product_name,
        finish,
        recorded_at: snap.recorded_at,
        market_cents: snap.market_cents,
        low_cents: snap.low_cents,
        mid_cents: snap.mid_cents,
        high_cents: snap.high_cents,
      })
      .onConflict((oc) => oc.columns(["external_id", "finish", "recorded_at"]).doNothing())
      .execute();
  },

  bulkUnmapSql: async (tx) => {
    await sql`
      INSERT INTO tcgplayer_staging (external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, mid_cents, high_cents)
      SELECT s.external_id, s.group_id, s.product_name, p.finish, snap.recorded_at, snap.market_cents, snap.low_cents, snap.mid_cents, snap.high_cents
      FROM tcgplayer_sources s
      JOIN printings p ON p.id = s.printing_id
      JOIN tcgplayer_snapshots snap ON snap.source_id = s.id
      WHERE s.external_id IS NOT NULL
      ON CONFLICT (external_id, finish, recorded_at) DO NOTHING
    `.execute(tx);
  },
};

// ── Cardmarket config ───────────────────────────────────────────────────────

export const cardmarketConfig: MarketplaceConfig = {
  currency: "EUR",
  tables: {
    staging: "cardmarket_staging",
    sources: "cardmarket_sources",
    snapshots: "cardmarket_snapshots",
    groups: "cardmarket_expansions",
    ignored: "cardmarket_ignored_products",
    overrides: "cardmarket_staging_card_overrides",
  },
  groupIdColumn: "expansion_id",

  mapStagingPrices: (row) => ({
    marketCents: row.market_cents,
    lowCents: row.low_cents,
    currency: "EUR",
    midCents: null,
    highCents: null,
    trendCents: row.trend_cents,
    avg1Cents: row.avg1_cents,
    avg7Cents: row.avg7_cents,
    avg30Cents: row.avg30_cents,
  }),

  snapshotQuery: (printingIds) =>
    db
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
      .where("ps.printing_id", "in", printingIds)
      .orderBy("snap.recorded_at", "desc")
      .execute(),

  mapSnapshotPrices: (row) => ({
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
  }),

  insertSnapshot: async (tx, sourceId, row) => {
    await tx
      .insertInto("cardmarket_snapshots")
      .values({
        source_id: sourceId,
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
  },

  insertStagingFromSnapshot: async (tx, ps, finish, snap) => {
    await tx
      .insertInto("cardmarket_staging")
      .values({
        external_id: ps.external_id,
        group_id: ps.group_id,
        product_name: ps.product_name,
        finish,
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
  },

  bulkUnmapSql: async (tx) => {
    await sql`
      INSERT INTO cardmarket_staging (external_id, group_id, product_name, finish, recorded_at, market_cents, low_cents, trend_cents, avg1_cents, avg7_cents, avg30_cents)
      SELECT s.external_id, s.group_id, s.product_name, p.finish, snap.recorded_at, snap.market_cents, snap.low_cents, snap.trend_cents, snap.avg1_cents, snap.avg7_cents, snap.avg30_cents
      FROM cardmarket_sources s
      JOIN printings p ON p.id = s.printing_id
      JOIN cardmarket_snapshots snap ON snap.source_id = s.id
      WHERE s.external_id IS NOT NULL
      ON CONFLICT (external_id, finish, recorded_at) DO NOTHING
    `.execute(tx);
  },
};
