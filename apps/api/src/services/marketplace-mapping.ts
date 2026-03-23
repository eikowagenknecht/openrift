import type { StagedProductResponse } from "@openrift/shared";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { marketplaceMappingRepo } from "../repositories/marketplace-mapping.js";
import type {
  MarketplaceConfig,
  ProductInfo,
  StagingRow,
} from "../routes/admin/marketplace-configs.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface PrintingRow {
  printingId: string;
  shortCode: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  promoTypeSlug: string | null;
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
    shortCode: string;
    rarity: string;
    setName: string;
    artVariant: string;
    isSigned: boolean;
    promoTypeSlug: string | null;
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
      shortCode: row.shortCode,
      rarity: row.rarity,
      artVariant: row.artVariant,
      isSigned: row.isSigned,
      promoTypeSlug: row.promoTypeSlug,
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
  mapStagedRow: (row: StagingRow, opts?: { isOverride?: boolean }) => StagedProductResponse,
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
            groupId: p.sourceGroupId ?? undefined,
            groupName: p.sourceGroupId
              ? (groupNameMap.get(p.sourceGroupId) ?? `Group #${p.sourceGroupId}`)
              : undefined,
          });
        }
      }
    }

    // Two-pass filter for staged products:
    // 1. Exact externalId+finish match → always exclude (already mapped).
    // 2. externalId-only match → exclude UNLESS there is an unmapped printing
    //    whose finish matches the staged product (it could still be mapped).
    const assignedKeys = new Set(assignedProducts.map((p) => `${p.externalId}::${p.finish}`));
    const assignedExternalIds = new Set(assignedProducts.map((p) => p.externalId));
    const unmappedFinishes = new Set(
      group.printings.filter((p) => p.externalId === null).map((p) => p.finish),
    );
    const filteredStaged = stagedProducts.filter((p) => {
      if (assignedKeys.has(`${p.externalId}::${p.finish}`)) {
        return false;
      }
      if (assignedExternalIds.has(p.externalId) && !unmappedFinishes.has(p.finish)) {
        return false;
      }
      return true;
    });

    return {
      ...group,
      stagedProducts: filteredStaged,
      assignedProducts,
    };
  });
}

// ── getMappingOverview ───────────────────────────────────────────────────────

export async function getMappingOverview(db: Kysely<Database>, config: MarketplaceConfig) {
  const repo = marketplaceMappingRepo(db);

  // 1. Load ignored products
  const ignoredRows = await repo.ignoredProducts(config.marketplace);
  const ignoredKeys = new Set(ignoredRows.map((r) => `${r.externalId}::${r.finish}`));

  // 2. Fetch & deduplicate staged products
  const staged = await repo.allStaging(config.marketplace);

  const seenStagingKeys = new Set<string>();
  const uniqueStaged = staged.filter((row) => {
    const key = `${row.externalId}::${row.finish}`;
    if (ignoredKeys.has(key) || seenStagingKeys.has(key)) {
      return false;
    }
    seenStagingKeys.add(key);
    return true;
  });

  // 3. Build group display name lookup
  const groupRows = await repo.groupNames(config.marketplace);
  const groupNameMap = new Map<number, string>();
  for (const row of groupRows) {
    groupNameMap.set(row.gid as number, (row.name as string) ?? `Group #${row.gid}`);
  }

  // 4. Fetch all cards with printings, marketplace sources, and images
  const matchedCards = await repo.allCardsWithPrintings(config.marketplace);

  // 5. Build card index (groups + prefix-match lookup)
  const { cardGroups, cardNames } = buildCardIndex(matchedCards);

  // 5c. Load manual card overrides
  const overrideRows = await repo.stagingCardOverrides(config.marketplace);
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
  const mapStagedRow = (
    row: StagingRow,
    extra?: { isOverride?: boolean },
  ): StagedProductResponse => ({
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
      shortCode: p.shortCode,
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
): Promise<{ saved: number; skipped: { externalId: number; reason: string }[] }> {
  if (mappings.length === 0) {
    return { saved: 0, skipped: [] };
  }

  const repo = marketplaceMappingRepo(db);
  const skipped: { externalId: number; reason: string }[] = [];

  const saved = await db.transaction().execute(async (tx) => {
    // 1. Batch-fetch printing finishes (1 query instead of N)
    const printingIds = mappings.map((m) => m.printingId);
    const printingRows = await repo.printingFinishes(printingIds, tx);
    const finishByPrinting = new Map(printingRows.map((row) => [row.id, row.finish]));

    // 2. Batch-fetch staging rows (1 query instead of N)
    const externalIds = [...new Set(mappings.map((m) => m.externalId))];
    const allStagingRows = await repo.stagingByExternalIds(config.marketplace, externalIds, tx);
    const stagingByExtId = new Map<number, typeof allStagingRows>();
    for (const row of allStagingRows) {
      const list = stagingByExtId.get(row.externalId) ?? [];
      list.push(row);
      stagingByExtId.set(row.externalId, list);
    }

    // 3. Build source upsert values, collecting skip reasons
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
        skipped.push({ externalId: m.externalId, reason: "printing not found" });
        continue;
      }
      const first = stagingByExtId.get(m.externalId)?.[0];
      if (!first) {
        skipped.push({ externalId: m.externalId, reason: "no staging data found" });
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
    const sourceResults = await repo.upsertSources(sourceValues, tx);
    const productIdByPrinting = new Map(sourceResults.map((r) => [r.printingId, r.id]));

    // 5. Batch-insert snapshots (1 query instead of N×M)
    const snapshotRows: {
      productId: string;
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
      const productId = productIdByPrinting.get(sv.printingId);
      if (productId === undefined) {
        continue;
      }
      const rows = stagingByExtId.get(sv.externalId) ?? [];
      for (const row of rows) {
        snapshotRows.push({
          productId: productId,
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
      await repo.insertSnapshots(snapshotRows, tx);
    }

    // 6. Batch-delete staging rows (1 query instead of N)
    const deletePairs: { externalId: number; finish: string }[] = [];
    for (const sv of sourceValues) {
      const rows = stagingByExtId.get(sv.externalId) ?? [];
      for (const row of rows) {
        deletePairs.push({ externalId: sv.externalId, finish: row.finish });
      }
    }

    await repo.deleteStagingTuples(config.marketplace, deletePairs, tx);

    return sourceValues.length;
  });

  return { saved, skipped };
}

// ── unmapPrinting ───────────────────────────────────────────────────────────

export async function unmapPrinting(
  db: Kysely<Database>,
  config: MarketplaceConfig,
  printingId: string,
): Promise<void> {
  const repo = marketplaceMappingRepo(db);

  await db.transaction().execute(async (tx) => {
    const ps = await repo.getSource(config.marketplace, printingId, tx);

    if (!ps || ps.externalId === null) {
      return;
    }

    const printing = await repo.getPrintingFinish(printingId, tx);
    const snapshots = await repo.snapshotsByProductId(ps.id, tx);

    for (const snap of snapshots) {
      await config.insertStagingFromSnapshot(tx, ps, printing.finish, snap);
    }

    await repo.deleteSnapshotsByProductId(ps.id, tx);
    await repo.deleteSourceById(ps.id, tx);
  });
}

// ── unmapAll ────────────────────────────────────────────────────────────────

export async function unmapAll(
  db: Kysely<Database>,
  config: MarketplaceConfig,
): Promise<{ unmapped: number }> {
  const repo = marketplaceMappingRepo(db);

  const unmapped = await db.transaction().execute(async (tx) => {
    await config.bulkUnmapSql(tx);

    const count = await repo.countMappedSources(config.marketplace, tx);
    await repo.deleteSnapshotsForMappedSources(config.marketplace, tx);
    await repo.deleteMappedSources(config.marketplace, tx);

    return count;
  });

  return { unmapped };
}
