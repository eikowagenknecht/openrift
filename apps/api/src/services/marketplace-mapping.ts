import type { StagedProductResponse } from "@openrift/shared";
import { normalizeNameForMatching } from "@openrift/shared/utils";

import type { Repos, Transact } from "../deps.js";
import type {
  MarketplaceConfig,
  ProductInfo,
  StagingRow,
} from "../routes/admin/marketplace-configs.js";
import { createMarketplaceConfigs } from "../routes/admin/marketplace-configs.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface PrintingRow {
  printingId: string;
  shortCode: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  promoTypeSlug: string | null;
  finish: string;
  language: string;
  imageUrl: string | null;
  externalId: number | null;
  sourceGroupId: number | null;
  sourceLanguage: string | null;
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
    language: string;
    imageUrl: string | null;
    externalId: number | null;
    sourceGroupId: number | null;
    sourceLanguage: string | null;
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
      language: row.language,
      imageUrl: row.imageUrl,
      externalId: row.externalId,
      sourceGroupId: row.sourceGroupId,
      sourceLanguage: row.sourceLanguage,
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
    const stagingKey = `${row.externalId}::${row.finish}::${row.language}`;

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
    const stagingKey = `${row.externalId}::${row.finish}::${row.language}`;
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
      mapStagedRow(row, {
        isOverride: overrideMap.has(`${row.externalId}::${row.finish}::${row.language}`),
      }),
    );

    const seenAssigned = new Set<string>();
    const assignedProducts: typeof stagedProducts = [];
    for (const p of group.printings) {
      const dedupKey = `${p.externalId}::${p.finish}::${p.sourceLanguage}`;
      if (p.externalId !== null && !seenAssigned.has(dedupKey)) {
        seenAssigned.add(dedupKey);
        const info = mappedProductInfo.get(p.printingId);
        if (info) {
          assignedProducts.push({
            externalId: p.externalId,
            productName: info.productName ?? group.cardName,
            finish: p.finish,
            language: p.sourceLanguage ?? p.language,
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
    const assignedKeys = new Set(
      assignedProducts.map((p) => `${p.externalId}::${p.finish}::${p.language}`),
    );
    const assignedExternalIds = new Set(assignedProducts.map((p) => p.externalId));
    const unmappedFinishes = new Set(
      group.printings.filter((p) => p.externalId === null).map((p) => p.finish),
    );
    const filteredStaged = stagedProducts.filter((p) => {
      if (assignedKeys.has(`${p.externalId}::${p.finish}::${p.language}`)) {
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

export async function getMappingOverview(repos: Repos, config: MarketplaceConfig) {
  const repo = repos.marketplaceMapping;

  // 1. Load both L2 (whole-product) and L3 (per-variant) ignores.
  const [ignoredProductRows, ignoredVariantRows] = await Promise.all([
    repo.ignoredProducts(config.marketplace),
    repo.ignoredVariants(config.marketplace),
  ]);

  const ignoredProductIds = new Set(ignoredProductRows.map((r) => r.externalId));
  const ignoredVariantKeys = new Set(
    ignoredVariantRows.map((r) => `${r.externalId}::${r.finish}::${r.language}`),
  );
  const isIgnored = (row: { externalId: number; finish: string; language: string }): boolean =>
    ignoredProductIds.has(row.externalId) ||
    ignoredVariantKeys.has(`${row.externalId}::${row.finish}::${row.language}`);

  // 2. Fetch & deduplicate staged products
  const staged = await repo.allStaging(config.marketplace);

  const seenStagingKeys = new Set<string>();
  const uniqueStaged = staged.filter((row) => {
    const key = `${row.externalId}::${row.finish}::${row.language}`;
    if (isIgnored(row) || seenStagingKeys.has(key)) {
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
    overrideMap.set(`${row.externalId}::${row.finish}::${row.language}`, {
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
    language: row.language,
    ...config.mapStagingPrices(row),
    recordedAt: row.recordedAt.toISOString(),
    ...(extra?.isOverride === undefined ? {} : { isOverride: extra.isOverride }),
    groupId: row.groupId,
    groupName: groupNameMap.get(row.groupId) ?? `Group #${row.groupId}`,
  });

  // Unmatched products (excluding ignored)
  const unmatchedProducts = uniqueStaged
    .filter((row) => !matchedStagingKeys.has(`${row.externalId}::${row.finish}::${row.language}`))
    .map((row) => mapStagedRow(row));

  // Ignored products / variants — look up group from staging data. L2 ignores
  // carry no finish/language; for display purposes we pick the first staging
  // row with a matching external_id so the admin UI can show some provenance.
  const groupByExternal = new Map<string, number>();
  const groupByExternalOnly = new Map<number, number>();
  for (const row of staged) {
    if (row.externalId === null) {
      continue;
    }
    const key = `${row.externalId}::${row.finish}::${row.language}`;
    if (!groupByExternal.has(key)) {
      groupByExternal.set(key, row.groupId);
    }
    if (!groupByExternalOnly.has(row.externalId)) {
      groupByExternalOnly.set(row.externalId, row.groupId);
    }
  }

  const emptyPrices = {
    marketCents: 0,
    lowCents: null as number | null,
    midCents: null as number | null,
    highCents: null as number | null,
    trendCents: null as number | null,
    avg1Cents: null as number | null,
    avg7Cents: null as number | null,
    avg30Cents: null as number | null,
    currency: config.currency,
  };

  const ignoredProducts = [
    ...ignoredProductRows.map((r) => {
      const gid = groupByExternalOnly.get(r.externalId);
      return {
        level: "product" as const,
        externalId: r.externalId,
        productName: r.productName,
        finish: null as string | null,
        language: null as string | null,
        recordedAt: r.createdAt.toISOString(),
        ...emptyPrices,
        groupId: gid,
        groupName: gid === undefined ? undefined : (groupNameMap.get(gid) ?? `Group #${gid}`),
      };
    }),
    ...ignoredVariantRows.map((r) => {
      const gid = groupByExternal.get(`${r.externalId}::${r.finish}::${r.language}`);
      return {
        level: "variant" as const,
        externalId: r.externalId,
        productName: r.productName,
        finish: r.finish as string | null,
        language: r.language as string | null,
        recordedAt: r.createdAt.toISOString(),
        ...emptyPrices,
        groupId: gid,
        groupName: gid === undefined ? undefined : (groupNameMap.get(gid) ?? `Group #${gid}`),
      };
    }),
  ];

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
      language: p.language,
      isSigned: p.isSigned,
      externalId: p.externalId,
    })),
  }));

  return { groups, unmatchedProducts, ignoredProducts, allCards };
}

// ── saveMappings ────────────────────────────────────────────────────────────

export async function saveMappings(
  transact: Transact,
  config: MarketplaceConfig,
  mappings: { printingId: string; externalId: number }[],
): Promise<{ saved: number; skipped: { externalId: number; reason: string }[] }> {
  if (mappings.length === 0) {
    return { saved: 0, skipped: [] };
  }

  const skipped: { externalId: number; reason: string }[] = [];

  const saved = await transact(async (trxRepos) => {
    const repo = trxRepos.marketplaceMapping;

    // 1. Batch-fetch printing finishes and languages (1 query instead of N)
    const printingIds = mappings.map((m) => m.printingId);
    const printingRows = await repo.printingFinishesAndLanguages(printingIds);
    const printingInfoByid = new Map(
      printingRows.map((row) => [row.id, { finish: row.finish, language: row.language }]),
    );

    // 2. Batch-fetch staging rows (1 query instead of N)
    const externalIds = [...new Set(mappings.map((m) => m.externalId))];
    const allStagingRows = await repo.stagingByExternalIds(config.marketplace, externalIds);
    const stagingByKey = new Map<string, typeof allStagingRows>();
    for (const row of allStagingRows) {
      const key = `${row.externalId}::${row.finish}::${row.language}`;
      const list = stagingByKey.get(key) ?? [];
      list.push(row);
      stagingByKey.set(key, list);
    }

    // Collect available finish+language combos per external ID for error messages
    const variantsByExtId = new Map<number, Set<string>>();
    for (const row of allStagingRows) {
      const set = variantsByExtId.get(row.externalId) ?? new Set();
      set.add(`${row.finish}/${row.language}`);
      variantsByExtId.set(row.externalId, set);
    }

    // 3. Build upsert values, collecting skip reasons
    const upsertValues: {
      marketplace: string;
      printingId: string;
      externalId: number;
      groupId: number;
      productName: string;
      finish: string;
      language: string | null;
    }[] = [];
    for (const m of mappings) {
      const info = printingInfoByid.get(m.printingId);
      if (!info) {
        skipped.push({ externalId: m.externalId, reason: "printing not found" });
        continue;
      }
      const first = stagingByKey.get(`${m.externalId}::${info.finish}::${info.language}`)?.[0];
      if (!first) {
        const available = variantsByExtId.get(m.externalId);
        if (available && available.size > 0) {
          skipped.push({
            externalId: m.externalId,
            reason: `variant mismatch: printing is "${info.finish}/${info.language}" but product only has "${[...available].join(", ")}"`,
          });
        } else {
          skipped.push({ externalId: m.externalId, reason: "no staging data found" });
        }
        continue;
      }
      upsertValues.push({
        marketplace: config.marketplace,
        printingId: m.printingId,
        externalId: m.externalId,
        groupId: first.groupId,
        productName: first.productName,
        finish: info.finish,
        // Cardmarket's price guide is a cross-language aggregate, so variants
        // are stored with NULL language. Other marketplaces pin the variant
        // to the printing's actual language.
        language: config.languageAggregate ? null : info.language,
      });
    }

    if (upsertValues.length === 0) {
      return 0;
    }

    // 4. Batch-upsert product + variant rows (1 pair of queries instead of N)
    const upsertResults = await repo.upsertProductVariants(upsertValues);
    const variantIdByPrinting = new Map(upsertResults.map((r) => [r.printingId, r.variantId]));

    // 5. Batch-insert snapshots (1 query instead of N×M)
    const snapshotRows: {
      variantId: string;
      recordedAt: Date;
      marketCents: number | null;
      lowCents: number | null;
      midCents: number | null;
      highCents: number | null;
      trendCents: number | null;
      avg1Cents: number | null;
      avg7Cents: number | null;
      avg30Cents: number | null;
    }[] = [];
    for (const sv of upsertValues) {
      const variantId = variantIdByPrinting.get(sv.printingId);
      if (variantId === undefined) {
        continue;
      }
      // The variant's stored language can be NULL for language-aggregate
      // marketplaces; the staging key uses the printing's actual language
      // because that's what the scraper writes.
      const printingLanguage = printingInfoByid.get(sv.printingId)?.language;
      if (printingLanguage === undefined) {
        continue;
      }
      const stagingKey = `${sv.externalId}::${sv.finish}::${printingLanguage}`;
      const rows = stagingByKey.get(stagingKey) ?? [];
      for (const row of rows) {
        snapshotRows.push({
          variantId,
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
      await repo.insertSnapshots(snapshotRows);
    }

    // 6. Batch-delete staging rows (1 query instead of N).
    // Important: stagingByKey is keyed on the staging row's actual language
    // (e.g. "EN" for cardmarket, where the scraper uses a placeholder), not
    // on the variant's stored language (which is NULL for language-aggregate
    // marketplaces). Look up the printing's language via printingInfoByid.
    const deleteTuples: { externalId: number; finish: string; language: string }[] = [];
    for (const sv of upsertValues) {
      const printingLanguage = printingInfoByid.get(sv.printingId)?.language;
      if (printingLanguage === undefined) {
        continue;
      }
      const stagingKey = `${sv.externalId}::${sv.finish}::${printingLanguage}`;
      const rows = stagingByKey.get(stagingKey) ?? [];
      for (const row of rows) {
        deleteTuples.push({
          externalId: sv.externalId,
          finish: row.finish,
          language: row.language,
        });
      }
    }

    await repo.deleteStagingTuples(config.marketplace, deleteTuples);

    return upsertValues.length;
  });

  return { saved, skipped };
}

// ── unmapPrinting ───────────────────────────────────────────────────────────

export async function unmapPrinting(
  transact: Transact,
  config: MarketplaceConfig,
  printingId: string,
): Promise<void> {
  await transact(async (trxRepos) => {
    const repo = trxRepos.marketplaceMapping;
    const trxConfig =
      createMarketplaceConfigs(trxRepos)[
        config.marketplace as keyof ReturnType<typeof createMarketplaceConfigs>
      ];

    const variant = await repo.getVariantForPrinting(config.marketplace, printingId);

    if (!variant) {
      return;
    }

    const snapshots = await repo.snapshotsByVariantId(variant.variantId);

    // Cardmarket variants have `language = NULL` (cross-language aggregate),
    // but the staging table is NOT NULL. Fall back to the scraper's placeholder
    // "EN" so the next refresh cycle's upsert matcher can rebuild the variant
    // from staging (matcher ignores language for aggregate marketplaces).
    const stagingLanguage = variant.language ?? "EN";
    for (const snap of snapshots) {
      await trxConfig.insertStagingFromSnapshot(
        {
          externalId: variant.externalId,
          groupId: variant.groupId,
          productName: variant.productName,
        },
        variant.finish,
        stagingLanguage,
        snap,
      );
    }

    await repo.deleteSnapshotsByVariantId(variant.variantId);
    // Note: parent marketplace_products row intentionally left behind (Option A).
    // It still represents a known upstream listing and can be re-mapped later
    // without being re-created.
    await repo.deleteVariantById(variant.variantId);
  });
}

// ── unmapAll ────────────────────────────────────────────────────────────────

export async function unmapAll(
  transact: Transact,
  config: MarketplaceConfig,
): Promise<{ unmapped: number }> {
  const unmapped = await transact(async (trxRepos) => {
    const repo = trxRepos.marketplaceMapping;
    const trxConfig =
      createMarketplaceConfigs(trxRepos)[
        config.marketplace as keyof ReturnType<typeof createMarketplaceConfigs>
      ];

    await trxConfig.bulkUnmapSql();

    const count = await repo.countMappedVariants(config.marketplace);
    await repo.deleteSnapshotsForMappedVariants(config.marketplace);
    await repo.deleteMappedVariants(config.marketplace);

    return count;
  });

  return { unmapped };
}
