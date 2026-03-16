import { normalizeNameForMatching } from "@openrift/shared/utils";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { imageUrl } from "../db-helpers.js";
import type { Database } from "../db/index.js";
import type {
  MarketplaceConfig,
  ProductInfo,
  StagingRow,
} from "../routes/admin/marketplace-configs.js";

// ── Types ───────────────────────────────────────────────────────────────────

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
  sourceGroupId: number | null;
}

interface CardGroup {
  cardId: string;
  cardSlug: string;
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
  cardNames: { normName: string; baseName: string | null; groupKey: string }[];
}

// ── buildCardIndex ──────────────────────────────────────────────────────────

function buildCardIndex(
  matchedCards: {
    cardId: string;
    cardSlug: string;
    cardName: string;
    cardType: string;
    superTypes: unknown;
    domains: unknown;
    energy: number | null;
    might: number | null;
    printingId: string;
    setId: string;
    sourceId: string;
    rarity: string;
    setName: string;
    artVariant: string;
    isSigned: boolean;
    isPromo: boolean;
    finish: string;
    collectorNumber: number;
    imageUrl: string | null;
    externalId: number | null;
    sourceGroupId: number | null;
  }[],
): CardIndex {
  const cardGroups = new Map<string, CardGroup>();

  for (const row of matchedCards) {
    const key = row.cardId;
    let group = cardGroups.get(key);
    if (!group) {
      group = {
        cardId: row.cardId,
        cardSlug: row.cardSlug,
        cardName: row.cardName,
        cardType: row.cardType,
        superTypes: row.superTypes as string[],
        domains: row.domains as string[],
        energy: row.energy,
        might: row.might,
        setId: row.setId,
        setName: row.setName,
        printings: [],
      };
      cardGroups.set(key, group);
    }
    group.printings.push({
      printingId: row.printingId,
      sourceId: row.sourceId,
      rarity: row.rarity,
      artVariant: row.artVariant,
      isSigned: row.isSigned,
      isPromo: row.isPromo,
      finish: row.finish,
      collectorNumber: row.collectorNumber,
      imageUrl: row.imageUrl,
      externalId: row.externalId,
      sourceGroupId: row.sourceGroupId,
    });
  }

  // Global name index (deduplicated by cardId)
  const seenCards = new Set<string>();
  const cardNames: CardIndex["cardNames"] = [];
  for (const row of matchedCards) {
    if (seenCards.has(row.cardId)) {
      continue;
    }
    seenCards.add(row.cardId);
    const normName = normalizeNameForMatching(row.cardName);
    const dashIdx = row.cardName.indexOf(" - ");
    const baseName =
      dashIdx === -1 ? null : normalizeNameForMatching(row.cardName.slice(0, dashIdx));
    cardNames.push({ normName, baseName, groupKey: row.cardId });
  }
  cardNames.sort((a, b) => b.normName.length - a.normName.length);

  return { cardGroups, cardNames };
}

// ── matchStagedProducts ─────────────────────────────────────────────────────

function matchStagedProducts(
  uniqueStaged: StagingRow[],
  cardGroups: Map<string, CardGroup>,
  cardNames: CardIndex["cardNames"],
  overrideMap: Map<string, { cardId: string }>,
) {
  const stagedByCard = new Map<string, StagingRow[]>();
  const matchedStagingKeys = new Set<string>();

  for (const row of uniqueStaged) {
    const stagingKey = `${row.externalId}::${row.finish}`;

    // Check manual override first
    const override = overrideMap.get(stagingKey);
    if (override) {
      const groupKey = override.cardId;
      if (cardGroups.has(groupKey)) {
        const list = stagedByCard.get(groupKey) ?? [];
        list.push(row);
        stagedByCard.set(groupKey, list);
        matchedStagingKeys.add(stagingKey);
        continue;
      }
    }

    // Fall back to prefix matching against all card names
    const normProduct = normalizeNameForMatching(row.productName);
    for (const { normName, groupKey } of cardNames) {
      if (normProduct.startsWith(normName)) {
        const list = stagedByCard.get(groupKey) ?? [];
        list.push(row);
        stagedByCard.set(groupKey, list);
        matchedStagingKeys.add(stagingKey);
        break;
      }
    }
  }

  // Second pass: containment matching for products where a champion name is
  // prepended, e.g. "KaiSa Daughter of the Void" contains our card name
  // "Daughter of the Void", or "Master Yi Wuju Bladesman" contains the base
  // of "Wuju Bladesman - Starter" (baseName strips the " - Starter" suffix).
  for (const row of uniqueStaged) {
    const stagingKey = `${row.externalId}::${row.finish}`;
    if (matchedStagingKeys.has(stagingKey)) {
      continue;
    }
    const normProduct = normalizeNameForMatching(row.productName);
    for (const { normName, baseName, groupKey } of cardNames) {
      const nameToMatch = baseName ?? normName;
      if (nameToMatch.length >= 5 && normProduct.includes(nameToMatch)) {
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

// ── buildResponseGroups ─────────────────────────────────────────────────────

function buildResponseGroups(
  cardGroups: Map<string, CardGroup>,
  stagedByCard: Map<string, StagingRow[]>,
  overrideMap: Map<string, { cardId: string }>,
  mappedProductInfo: Map<string, ProductInfo>,
  groupNameMap: Map<number, string>,
  mapStagedRow: (row: StagingRow, opts?: { isOverride?: boolean }) => Record<string, unknown>,
) {
  return [...cardGroups.values()].map((group) => {
    const key = group.cardId;
    const stagedProducts = (stagedByCard.get(key) ?? []).map((row) =>
      mapStagedRow(row, { isOverride: overrideMap.has(`${row.externalId}::${row.finish}`) }),
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
            groupId: p.sourceGroupId,
            groupName: p.sourceGroupId
              ? (groupNameMap.get(p.sourceGroupId) ?? `Group #${p.sourceGroupId}`)
              : undefined,
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
}

// ── getMappingOverview ───────────────────────────────────────────────────────

export async function getMappingOverview(db: Kysely<Database>, config: MarketplaceConfig) {
  // 1. Load ignored products
  const ignoredRows = await db
    .selectFrom("marketplaceIgnoredProducts")
    .select(["externalId", "finish", "productName", "createdAt"])
    .where("marketplace", "=", config.marketplace)
    .execute();
  const ignoredKeys = new Set(ignoredRows.map((r) => `${r.externalId}::${r.finish}`));

  // 2. Fetch & deduplicate staged products
  const staged = await db
    .selectFrom("marketplaceStaging")
    .selectAll()
    .where("marketplace", "=", config.marketplace)
    .orderBy("recordedAt", "desc")
    .execute();

  const seenStagingKeys = new Set<string>();
  const uniqueStaged = staged.filter((row) => {
    if (row.externalId === null) {
      return false;
    }
    const key = `${row.externalId}::${row.finish}`;
    if (ignoredKeys.has(key) || seenStagingKeys.has(key)) {
      return false;
    }
    seenStagingKeys.add(key);
    return true;
  });

  // 3. Build group display name lookup
  const groupRows = await db
    .selectFrom("marketplaceGroups")
    .select(["groupId as gid", "name"])
    .where("marketplace", "=", config.marketplace)
    .execute();
  const groupNameMap = new Map<number, string>();
  for (const row of groupRows) {
    groupNameMap.set(row.gid as number, (row.name as string) ?? `Group #${row.gid}`);
  }

  // 4. Build card query — fetch all cards
  const query = db
    .selectFrom("cards as c")
    .innerJoin("printings as p", "p.cardId", "c.id")
    .innerJoin("sets as s", "s.id", "p.setId")
    .leftJoin("marketplaceSources as ps", (join) =>
      join.onRef("ps.printingId", "=", "p.id").on("ps.marketplace", "=", config.marketplace),
    )
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .select([
      "c.id as cardId",
      "c.slug as cardSlug",
      "c.name as cardName",
      "c.type as cardType",
      "c.superTypes",
      "c.domains",
      "c.energy",
      "c.might",
      "p.id as printingId",
      "s.slug as setId",
      "p.sourceId",
      "p.rarity",
      "s.name as setName",
      "p.artVariant",
      "p.isSigned",
      "p.isPromo",
      "p.finish",
      "p.collectorNumber",
      imageUrl("pi").as("imageUrl"),
      "ps.externalId",
      "ps.groupId as sourceGroupId",
    ])
    .orderBy("s.slug")
    .orderBy("c.name")
    .orderBy("p.sourceId")
    .orderBy("p.finish", "desc");

  const matchedCards = await query.execute();

  // 5. Build card index (groups + prefix-match lookup)
  const { cardGroups, cardNames } = buildCardIndex(matchedCards);

  // 5c. Load manual card overrides
  const overrideRows = await db
    .selectFrom("marketplaceStagingCardOverrides")
    .select(["externalId", "finish", "cardId"])
    .where("marketplace", "=", config.marketplace)
    .execute();
  const overrideMap = new Map<string, { cardId: string }>();
  for (const row of overrideRows) {
    overrideMap.set(`${row.externalId}::${row.finish}`, {
      cardId: row.cardId,
    });
  }

  // 5d. Match staged products to card groups
  const { stagedByCard, matchedStagingKeys } = matchStagedProducts(
    uniqueStaged,
    cardGroups,
    cardNames,
    overrideMap,
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
      if (!mappedProductInfo.has(row.printingId)) {
        mappedProductInfo.set(row.printingId, config.mapSnapshotPrices(row));
      }
    }
  }

  // 7. Map staged rows to product format
  const mapStagedRow = (row: StagingRow, extra?: { isOverride?: boolean }) => ({
    externalId: row.externalId ?? "",
    productName: row.productName,
    finish: row.finish,
    ...config.mapStagingPrices(row),
    recordedAt: row.recordedAt.toISOString(),
    ...(extra?.isOverride === undefined ? {} : { isOverride: extra.isOverride }),
    groupId: row.groupId,
    groupName: groupNameMap.get(row.groupId) ?? `Group #${row.groupId}`,
  });

  // Unmatched products (excluding ignored)
  const unmatchedProducts = uniqueStaged
    .filter(
      (row) =>
        !matchedStagingKeys.has(`${row.externalId}::${row.finish}`) &&
        !ignoredKeys.has(`${row.externalId}::${row.finish}`),
    )
    .map((row) => mapStagedRow(row));

  // Ignored products — look up group from staging data
  const groupByExternal = new Map<string, number>();
  for (const row of staged) {
    if (row.externalId !== null) {
      const key = `${row.externalId}::${row.finish}`;
      if (!groupByExternal.has(key)) {
        groupByExternal.set(key, row.groupId);
      }
    }
  }
  const ignoredProducts = ignoredRows.map((r) => {
    const gid = groupByExternal.get(`${r.externalId}::${r.finish}`);
    return {
      externalId: r.externalId,
      productName: r.productName,
      finish: r.finish,
      marketCents: 0,
      lowCents: null as number | null,
      currency: config.currency,
      recordedAt: r.createdAt.toISOString(),
      midCents: null as number | null,
      highCents: null as number | null,
      trendCents: null as number | null,
      avg1Cents: null as number | null,
      avg7Cents: null as number | null,
      avg30Cents: null as number | null,
      groupId: gid,
      groupName: gid === undefined ? undefined : (groupNameMap.get(gid) ?? `Group #${gid}`),
    };
  });

  // 8. Build response groups
  const groups = buildResponseGroups(
    cardGroups,
    stagedByCard,
    overrideMap,
    mappedProductInfo,
    groupNameMap,
    mapStagedRow,
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
      externalId: p.externalId,
    })),
  }));

  return { groups, unmatchedProducts, ignoredProducts, allCards };
}

// ── saveMappings ────────────────────────────────────────────────────────────

export async function saveMappings(
  db: Kysely<Database>,
  config: MarketplaceConfig,
  mappings: { printingId: string; externalId: number }[],
): Promise<{ saved: number }> {
  if (mappings.length === 0) {
    return { saved: 0 };
  }

  const saved = await db.transaction().execute(async (tx) => {
    // 1. Batch-fetch printing finishes (1 query instead of N)
    const printingIds = mappings.map((m) => m.printingId);
    const printingRows = await tx
      .selectFrom("printings")
      .select(["id", "finish"])
      .where("id", "in", printingIds)
      .execute();
    const finishByPrinting = new Map(printingRows.map((row) => [row.id, row.finish]));

    // 2. Batch-fetch staging rows (1 query instead of N)
    const externalIds = [...new Set(mappings.map((m) => m.externalId))];
    const allStagingRows = await tx
      .selectFrom("marketplaceStaging")
      .selectAll()
      .where("marketplace", "=", config.marketplace)
      .where("externalId", "in", externalIds)
      .execute();
    const stagingByKey = new Map<string, typeof allStagingRows>();
    for (const row of allStagingRows) {
      const key = `${row.externalId}::${row.finish}`;
      const list = stagingByKey.get(key) ?? [];
      list.push(row);
      stagingByKey.set(key, list);
    }

    // 3. Build source upsert values, filtering out mappings with no staging data
    const sourceValues: {
      marketplace: string;
      printingId: string;
      externalId: number;
      groupId: number;
      productName: string;
    }[] = [];
    for (const m of mappings) {
      const finish = finishByPrinting.get(m.printingId);
      if (!finish) {
        continue;
      }
      const first = stagingByKey.get(`${m.externalId}::${finish}`)?.[0];
      if (!first) {
        continue;
      }
      sourceValues.push({
        marketplace: config.marketplace,
        printingId: m.printingId,
        externalId: m.externalId,
        groupId: first.groupId,
        productName: first.productName,
      });
    }

    if (sourceValues.length === 0) {
      return 0;
    }

    // 4. Batch-upsert sources (1 query instead of N)
    const sourceResults = await tx
      .insertInto("marketplaceSources")
      .values(sourceValues)
      .onConflict((oc) =>
        oc.columns(["marketplace", "printingId"]).doUpdateSet({
          externalId: sql<number>`excluded.external_id`,
          groupId: sql<number>`excluded.group_id`,
          productName: sql<string>`excluded.product_name`,
          updatedAt: new Date(),
        }),
      )
      .returning(["id", "printingId"])
      .execute();
    const sourceIdByPrinting = new Map(sourceResults.map((r) => [r.printingId, r.id]));

    // 5. Batch-insert snapshots (1 query instead of N×M)
    const snapshotRows: {
      sourceId: string;
      recordedAt: Date;
      marketCents: number;
      lowCents: number | null;
      midCents: number | null;
      highCents: number | null;
      trendCents: number | null;
      avg1Cents: number | null;
      avg7Cents: number | null;
      avg30Cents: number | null;
    }[] = [];
    for (const sv of sourceValues) {
      const sourceId = sourceIdByPrinting.get(sv.printingId);
      if (sourceId === undefined) {
        continue;
      }
      const finish = finishByPrinting.get(sv.printingId);
      if (!finish) {
        continue;
      }
      const rows = stagingByKey.get(`${sv.externalId}::${finish}`) ?? [];
      for (const row of rows) {
        snapshotRows.push({
          sourceId: sourceId,
          recordedAt: row.recordedAt,
          marketCents: row.marketCents,
          lowCents: row.lowCents,
          midCents: row.midCents,
          highCents: row.highCents,
          trendCents: row.trendCents,
          avg1Cents: row.avg1Cents,
          avg7Cents: row.avg7Cents,
          avg30Cents: row.avg30Cents,
        });
      }
    }

    if (snapshotRows.length > 0) {
      await tx
        .insertInto("marketplaceSnapshots")
        .values(snapshotRows)
        .onConflict((oc) =>
          oc.columns(["sourceId", "recordedAt"]).doUpdateSet({
            marketCents: sql<number>`excluded.market_cents`,
            lowCents: sql<number | null>`excluded.low_cents`,
            midCents: sql<number | null>`excluded.mid_cents`,
            highCents: sql<number | null>`excluded.high_cents`,
            trendCents: sql<number | null>`excluded.trend_cents`,
            avg1Cents: sql<number | null>`excluded.avg1_cents`,
            avg7Cents: sql<number | null>`excluded.avg7_cents`,
            avg30Cents: sql<number | null>`excluded.avg30_cents`,
          }),
        )
        .execute();
    }

    // 6. Batch-delete staging rows (1 query instead of N)
    const deletePairs: ReturnType<typeof sql>[] = [];
    for (const sv of sourceValues) {
      const finish = finishByPrinting.get(sv.printingId);
      if (finish) {
        deletePairs.push(sql`(${sv.externalId}::integer, ${finish})`);
      }
    }

    // raw sql: multi-column tuple IN (VALUES ...) not supported by Kysely
    await sql`
      DELETE FROM marketplace_staging
      WHERE marketplace = ${config.marketplace}
        AND (external_id, finish) IN (VALUES ${sql.join(deletePairs)})
    `.execute(tx);

    return sourceValues.length;
  });

  return { saved };
}

// ── unmapPrinting ───────────────────────────────────────────────────────────

export async function unmapPrinting(
  db: Kysely<Database>,
  config: MarketplaceConfig,
  printingId: string,
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const ps = await tx
      .selectFrom("marketplaceSources")
      .selectAll()
      .where("marketplace", "=", config.marketplace)
      .where("printingId", "=", printingId)
      .executeTakeFirst();

    if (!ps || ps.externalId === null) {
      return;
    }

    const printing = await tx
      .selectFrom("printings")
      .select("finish")
      .where("id", "=", printingId)
      .executeTakeFirstOrThrow();

    const snapshots = await tx
      .selectFrom("marketplaceSnapshots")
      .selectAll()
      .where("sourceId", "=", ps.id)
      .execute();

    for (const snap of snapshots) {
      await config.insertStagingFromSnapshot(tx, ps, printing.finish, snap);
    }

    await tx.deleteFrom("marketplaceSnapshots").where("sourceId", "=", ps.id).execute();
    await tx.deleteFrom("marketplaceSources").where("id", "=", ps.id).execute();
  });
}

// ── unmapAll ────────────────────────────────────────────────────────────────

export async function unmapAll(
  db: Kysely<Database>,
  config: MarketplaceConfig,
): Promise<{ unmapped: number }> {
  const unmapped = await db.transaction().execute(async (tx) => {
    await config.bulkUnmapSql(tx);

    const countResult = await tx
      .selectFrom("marketplaceSources")
      .select(sql<number>`count(*)`.as("count"))
      .where("marketplace", "=", config.marketplace)
      .where("externalId", "is not", null)
      .executeTakeFirstOrThrow();

    await sql`
      DELETE FROM marketplace_snapshots
      WHERE source_id IN (
        SELECT id FROM marketplace_sources
        WHERE marketplace = ${config.marketplace} AND external_id IS NOT NULL
      )
    `.execute(tx);

    await tx
      .deleteFrom("marketplaceSources")
      .where("marketplace", "=", config.marketplace)
      .where("externalId", "is not", null)
      .execute();

    return Number(countResult.count);
  });

  return { unmapped };
}
