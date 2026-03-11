import type { Hono } from "hono";
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
import type { MarketplaceConfig, ProductInfo, StagingRow } from "./marketplace-configs.js";

// ── Shared helpers ──────────────────────────────────────────────────────────

const normalizeName = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

// ── Types for GET helper functions ──────────────────────────────────────────

interface PrintingRow {
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
}

interface CardGroup {
  cardId: string;
  cardName: string;
  cardType: string;
  superTypes: string[];
  domains: string[];
  energy: number | null;
  might: number | null;
  setId: string;
  setName: string;
  printings: PrintingRow[];
}

interface CardIndex {
  cardGroups: Map<string, CardGroup>;
  cardNamesBySet: Map<string, { normName: string; groupKey: string }[]>;
}

// ── GET helper: build card index ───────────────────────────────────────────

function buildCardIndex(
  matchedCards: {
    card_id: string;
    card_name: string;
    card_type: string;
    super_types: unknown;
    domains: unknown;
    energy: number | null;
    might: number | null;
    printing_id: string;
    set_id: string;
    source_id: string;
    rarity: string;
    set_name: string;
    art_variant: string;
    is_signed: boolean;
    is_promo: boolean;
    finish: string;
    collector_number: number;
    image_url: string | null;
    external_id: number | null;
  }[],
): CardIndex {
  const cardGroups = new Map<string, CardGroup>();

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

  const cardNamesBySet = new Map<string, { normName: string; groupKey: string }[]>();
  for (const [key, group] of cardGroups) {
    const list = cardNamesBySet.get(group.setId) ?? [];
    list.push({ normName: normalizeName(group.cardName), groupKey: key });
    cardNamesBySet.set(group.setId, list);
  }
  for (const list of cardNamesBySet.values()) {
    list.sort((a, b) => b.normName.length - a.normName.length);
  }

  return { cardGroups, cardNamesBySet };
}

// ── GET helper: match staged products to card groups ───────────────────────

function matchStagedProducts(
  uniqueStaged: StagingRow[],
  cardGroups: Map<string, CardGroup>,
  cardNamesBySet: Map<string, { normName: string; groupKey: string }[]>,
  overrideMap: Map<string, { cardId: string; setId: string }>,
  groupSetMap: Map<number, string>,
) {
  const stagedByCard = new Map<string, StagingRow[]>();
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

  return { stagedByCard, matchedStagingKeys };
}

// ── GET helper: build response groups ──────────────────────────────────────

function buildResponseGroups(
  cardGroups: Map<string, CardGroup>,
  stagedByCard: Map<string, StagingRow[]>,
  overrideMap: Map<string, { cardId: string; setId: string }>,
  mappedProductInfo: Map<string, ProductInfo>,
  mapStagedRow: (row: StagingRow, opts?: { isOverride?: boolean }) => Record<string, unknown>,
  showAll: boolean,
) {
  return [...cardGroups.values()]
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
    })
    .filter((group) => {
      if (showAll) {
        return true;
      }
      const hasStaged = group.stagedProducts.length > 0;
      const hasUnmapped = group.printings.some((p) => p.externalId === null);
      return hasStaged || hasUnmapped;
    });
}

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

    // 5. Build card index (groups + prefix-match lookup)
    const { cardGroups, cardNamesBySet } = buildCardIndex(matchedCards);

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

    // 5d. Match staged products to card groups
    const { stagedByCard, matchedStagingKeys } = matchStagedProducts(
      uniqueStaged,
      cardGroups,
      cardNamesBySet,
      overrideMap,
      groupSetMap,
    );

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
    const groups = buildResponseGroups(
      cardGroups,
      stagedByCard,
      overrideMap,
      mappedProductInfo,
      mapStagedRow,
      showAll,
    );

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
