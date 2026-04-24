import type {
  MarketplaceAssignmentResponse as MarketplaceAssignment,
  MarketplaceGroupKind,
  StagedProductResponse,
} from "@openrift/shared";
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
  markerSlugs: string[];
  /** The printing's own finish (may be `metal` / `metal-deluxe` — the marketplace never sees those). */
  finish: string;
  language: string;
  imageUrl: string | null;
  externalId: number | null;
  sourceGroupId: number | null;
  /** The bound SKU's language (NULL for CM/TCG). Null when no variant is bound. */
  sourceLanguage: string | null;
  /** The bound SKU's finish (always `normal` / `foil` from the marketplace's view). Null when no variant is bound. */
  productFinish: string | null;
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

export function buildCardIndex(
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
    markerSlugs: string[];
    finish: string;
    language: string;
    imageUrl: string | null;
    externalId: number | null;
    sourceGroupId: number | null;
    sourceLanguage: string | null;
    productFinish: string | null;
  }[],
  // When the caller scopes `matchedCards` to a subset (e.g. the card-detail
  // endpoint that only wants one card), the name index built from that subset
  // can't break ties against cards outside the scope — so "Blastcone Fae"
  // products would match "Blast Cone"'s shorter alias. Pass every card's
  // (cardId, cardName) here to restore the global longest-match tiebreak.
  // `matchStagedProducts` drops rows whose winning alias belongs to a card
  // not in `cardGroups`, so only in-scope assignments surface in the response.
  allCardsForMatching?: { cardId: string; cardName: string }[],
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
      markerSlugs: [...(row.markerSlugs ?? [])],
      finish: row.finish,
      language: row.language,
      imageUrl: row.imageUrl,
      externalId: row.externalId,
      sourceGroupId: row.sourceGroupId,
      sourceLanguage: row.sourceLanguage,
      productFinish: row.productFinish,
    });
  }

  // Global name index (deduplicated by cardId). Prefer `allCardsForMatching`
  // when provided so the longest-first tiebreak sees every card, not just the
  // scoped subset.
  const nameRows = allCardsForMatching ?? matchedCards;
  const seenCards = new Set<string>();
  const cardNames: CardIndex["cardNames"] = [];
  for (const row of nameRows) {
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

    // Fall back to prefix matching against all card names. `cardNames` is
    // sorted longest-first, so the first match is the most specific. If the
    // winning card isn't in our scoped `cardGroups` we still mark the row as
    // matched so it won't surface as unmatched — the row belongs to another
    // card and simply doesn't appear in this response.
    const normProduct = normalizeNameForMatching(row.productName);
    for (const { normName, groupKey } of cardNames) {
      if (normProduct.startsWith(normName)) {
        if (cardGroups.has(groupKey)) {
          const list = stagedByCard.get(groupKey) ?? [];
          list.push(row);
          stagedByCard.set(groupKey, list);
        }
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
        if (cardGroups.has(groupKey)) {
          const list = stagedByCard.get(groupKey) ?? [];
          list.push(row);
          stagedByCard.set(groupKey, list);
        }
        matchedStagingKeys.add(stagingKey);
        break;
      }
    }
  }

  return { stagedByCard, matchedStagingKeys };
}

// ── buildResponseGroups ─────────────────────────────────────────────────────

export function buildResponseGroups(
  cardGroups: Map<string, CardGroup>,
  stagedByCard: Map<string, StagingRow[]>,
  overrideMap: Map<string, { cardId: string }>,
  mappedProductInfo: Map<string, ProductInfo>,
  groupNameMap: Map<number, string>,
  groupKindMap: Map<number, MarketplaceGroupKind>,
  mapStagedRow: (row: StagingRow, opts?: { isOverride?: boolean }) => StagedProductResponse,
) {
  return [...cardGroups.values()].map((group) => {
    const key = group.cardId;
    const stagedProducts = (stagedByCard.get(key) ?? []).map((row) =>
      mapStagedRow(row, {
        isOverride: overrideMap.has(`${row.externalId}::${row.finish}::${row.language}`),
      }),
    );

    // Authoritative (product × printing) assignment list. We intentionally keep
    // every (externalId, printingId) pair — a single printing can have multiple
    // variants in the same marketplace, and downstream consumers need to know
    // which printings any given externalId resolves to.
    //
    // `finish` and `language` here describe the *marketplace* SKU the variant
    // binds to, not the printing — e.g. a metal printing mapped to CM's foil
    // SKU yields finish="foil". That's how the admin table distinguishes
    // "product finish" from "printing finish" and flags mismatches.
    const seenAssignment = new Set<string>();
    const assignments: MarketplaceAssignment[] = [];
    for (const p of group.printings) {
      if (p.externalId === null || p.productFinish === null) {
        continue;
      }
      const dedupKey = `${p.externalId}::${p.printingId}::${p.productFinish}::${p.sourceLanguage ?? ""}`;
      if (seenAssignment.has(dedupKey)) {
        continue;
      }
      seenAssignment.add(dedupKey);
      assignments.push({
        externalId: p.externalId,
        printingId: p.printingId,
        finish: p.productFinish,
        language: p.sourceLanguage,
      });
    }

    const seenAssigned = new Set<string>();
    const assignedProducts: typeof stagedProducts = [];
    for (const p of group.printings) {
      if (p.externalId === null || p.productFinish === null) {
        continue;
      }
      const dedupKey = `${p.externalId}::${p.productFinish}::${p.sourceLanguage ?? ""}`;
      if (seenAssigned.has(dedupKey)) {
        continue;
      }
      seenAssigned.add(dedupKey);
      const info = mappedProductInfo.get(`${p.printingId}::${p.externalId}`);
      if (info) {
        assignedProducts.push({
          externalId: p.externalId,
          productName: info.productName ?? group.cardName,
          finish: p.productFinish,
          language: p.sourceLanguage,
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
          groupKind: p.sourceGroupId === null ? undefined : groupKindMap.get(p.sourceGroupId),
        });
      }
    }

    // Filter already-mapped SKUs out of the staged list. The SKU key is
    // `(externalId, finish, language)` with language NULL for CM/TCG — since
    // those marketplaces only have one row per (externalId, finish), once it's
    // bound it's gone from staged regardless of which printing language took
    // it. Per-language marketplaces (CT) still see both foil/EN and foil/ZH
    // as independent SKUs.
    const skuKey = (externalId: number, finish: string, language: string | null): string =>
      `${externalId}::${finish}::${language ?? ""}`;
    const assignedKeys = new Set(
      assignedProducts.map((p) => skuKey(p.externalId, p.finish, p.language)),
    );
    const filteredStaged = stagedProducts.filter(
      (p) => !assignedKeys.has(skuKey(p.externalId, p.finish, p.language)),
    );

    return {
      ...group,
      stagedProducts: filteredStaged,
      assignedProducts,
      assignments,
    };
  });
}

// ── getMappingOverview ───────────────────────────────────────────────────────

type MatchedCardsRow = Awaited<
  ReturnType<Repos["marketplaceMapping"]["allCardsWithPrintings"]>
>[number];

interface GetMappingOverviewOptions {
  /**
   * Pre-fetched cards-with-printings rows for this marketplace. The unified
   * mapping endpoint passes this to avoid running the heavy
   * cards × printings × images joins three times (once per marketplace).
   */
  matchedCards?: MatchedCardsRow[];
  /**
   * Every card's (cardId, cardName) used purely for the name-index tiebreak.
   * Required when `matchedCards` is a narrow subset (e.g. the card-detail
   * endpoint scopes to one card) — without it, the longest-first sort can't
   * see competing aliases and short prefixes steal products from longer ones.
   */
  allCardsForMatching?: { cardId: string; cardName: string }[];
}

export async function getMappingOverview(
  repos: Repos,
  config: MarketplaceConfig,
  options?: GetMappingOverviewOptions,
) {
  const repo = repos.marketplaceMapping;

  // All independent queries fire in parallel — none depend on each other,
  // and serializing them was wasting ~30ms per marketplace.
  const [ignoredProductRows, ignoredVariantRows, staged, groupRows, fetchedCards, overrideRows] =
    await Promise.all([
      repo.ignoredProducts(config.marketplace),
      repo.ignoredVariants(config.marketplace),
      repo.allStaging(config.marketplace),
      repo.groupNames(config.marketplace),
      options?.matchedCards
        ? Promise.resolve(options.matchedCards)
        : repo.allCardsWithPrintings(config.marketplace),
      repo.stagingCardOverrides(config.marketplace),
    ]);
  const matchedCards = fetchedCards;

  const ignoredProductIds = new Set(ignoredProductRows.map((r) => r.externalId));
  const ignoredVariantKeys = new Set(
    ignoredVariantRows.map((r) => `${r.externalId}::${r.finish}::${r.language}`),
  );
  const isIgnored = (row: { externalId: number; finish: string; language: string }): boolean =>
    ignoredProductIds.has(row.externalId) ||
    ignoredVariantKeys.has(`${row.externalId}::${row.finish}::${row.language}`);

  // allStaging returns one row per distinct variant (latest snapshot), so only
  // the ignored filter is needed here.
  const uniqueStaged = staged.filter((row) => !isIgnored(row));

  const groupNameMap = new Map<number, string>();
  const groupKindMap = new Map<number, MarketplaceGroupKind>();
  for (const row of groupRows) {
    groupNameMap.set(row.gid as number, (row.name as string) ?? `Group #${row.gid}`);
    groupKindMap.set(row.gid as number, row.groupKind);
  }

  const { cardGroups, cardNames } = buildCardIndex(matchedCards, options?.allCardsForMatching);

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

  // Key by (printingId, externalId) so we don't share snapshot info across
  // different products that happen to map to the same printing.
  const mappedProductInfo = new Map<string, ProductInfo>();
  if (mappedPrintingIds.size > 0) {
    const mappedRows = await config.snapshotQuery([...mappedPrintingIds]);
    for (const row of mappedRows) {
      const key = `${row.printingId}::${row.externalId}`;
      if (!mappedProductInfo.has(key)) {
        mappedProductInfo.set(key, config.mapSnapshotPrices(row));
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
    groupKind: groupKindMap.get(row.groupId),
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
    groupKindMap,
    mapStagedRow,
  );

  // Lightweight card list for the manual-assign dropdown. The UI only needs
  // card identity, set name (shown as detail), and short codes (the smallest
  // one labels each dropdown row). Keeping only those fields shrinks this
  // section of the response by ~4×.
  const allCards = [...cardGroups.values()].map((g) => ({
    cardId: g.cardId,
    cardSlug: g.cardSlug,
    cardName: g.cardName,
    setName: g.setName,
    shortCodes: g.printings.map((p) => p.shortCode),
  }));

  return { groups, unmatchedProducts, ignoredProducts, allCards };
}

// ── saveMappings ────────────────────────────────────────────────────────────

/**
 * Caller-supplied SKU tuple. The UI passes the (externalId, finish, language)
 * from the product row the admin clicked on — we no longer guess it from the
 * printing. Metal printings mapped to foil marketplace SKUs, CM's
 * language-aggregate SKU assigned to a ZH printing: both are legal with this
 * signature. The service just verifies the SKU exists (in staging or as an
 * already-upserted product) before binding it.
 */
interface SaveMappingInput {
  printingId: string;
  externalId: number;
  finish: string;
  /** `null` for marketplaces that don't expose language as a SKU dimension (CM/TCG). */
  language: string | null;
}

export async function saveMappings(
  transact: Transact,
  config: MarketplaceConfig,
  mappings: SaveMappingInput[],
): Promise<{ saved: number; skipped: { externalId: number; reason: string }[] }> {
  if (mappings.length === 0) {
    return { saved: 0, skipped: [] };
  }

  const skipped: { externalId: number; reason: string }[] = [];

  const skuKey = (externalId: number, finish: string, language: string | null): string =>
    `${externalId}::${finish}::${language ?? ""}`;

  const saved = await transact(async (trxRepos) => {
    const repo = trxRepos.marketplaceMapping;

    // 1. Batch-fetch staging rows and already-upserted product rows for the
    //    external IDs in this batch. The product-row fallback lets us rebind
    //    a mapping even when staging has rotated out — common for products
    //    that were mapped long ago.
    const externalIds = [...new Set(mappings.map((m) => m.externalId))];
    const [allStagingRows, existingProducts] = await Promise.all([
      repo.stagingByExternalIds(config.marketplace, externalIds),
      repo.productsByExternalIds(config.marketplace, externalIds),
    ]);

    const stagingByKey = new Map<string, typeof allStagingRows>();
    for (const row of allStagingRows) {
      const key = skuKey(row.externalId, row.finish, row.language);
      const list = stagingByKey.get(key) ?? [];
      list.push(row);
      stagingByKey.set(key, list);
    }

    const productByKey = new Map(
      existingProducts.map((p) => [skuKey(p.externalId, p.finish, p.language), p]),
    );

    // Collect available SKU combos per external ID for error messages. Uses
    // staging first, falls back to the product table when staging has rotated.
    const skusByExtId = new Map<number, Set<string>>();
    const recordSku = (externalId: number, finish: string, language: string | null): void => {
      const set = skusByExtId.get(externalId) ?? new Set();
      set.add(language === null ? finish : `${finish}/${language}`);
      skusByExtId.set(externalId, set);
    };
    for (const row of allStagingRows) {
      recordSku(row.externalId, row.finish, row.language);
    }
    for (const row of existingProducts) {
      recordSku(row.externalId, row.finish, row.language);
    }

    // 2. Resolve each mapping to a concrete SKU row (staging preferred, then
    //    existing product as fallback) and build upsert values.
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
      const key = skuKey(m.externalId, m.finish, m.language);
      const stagingHit = stagingByKey.get(key)?.[0];
      let groupId: number;
      let productName: string;
      if (stagingHit) {
        groupId = stagingHit.groupId;
        productName = stagingHit.productName;
      } else {
        const existing = productByKey.get(key);
        if (existing) {
          groupId = existing.groupId;
          productName = existing.productName;
        } else {
          const available = skusByExtId.get(m.externalId);
          const requested = m.language === null ? m.finish : `${m.finish}/${m.language}`;
          const reason =
            available && available.size > 0
              ? `SKU mismatch: requested "${requested}" but product only has "${[...available].join(", ")}"`
              : "no staging data found";
          skipped.push({ externalId: m.externalId, reason });
          continue;
        }
      }
      upsertValues.push({
        marketplace: config.marketplace,
        printingId: m.printingId,
        externalId: m.externalId,
        groupId,
        productName,
        finish: m.finish,
        language: m.language,
      });
    }

    if (upsertValues.length === 0) {
      return 0;
    }

    // 3. Upsert per-SKU product + variant bridge rows.
    const upsertResults = await repo.upsertProductVariants(upsertValues);
    const variantIdByKey = new Map(
      upsertResults.map((r) => [
        `${r.printingId}::${skuKey(r.externalId, r.finish, r.language)}`,
        r.variantId,
      ]),
    );

    // 4. Insert snapshots from any staging rows we just absorbed.
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
      const variantId = variantIdByKey.get(
        `${sv.printingId}::${skuKey(sv.externalId, sv.finish, sv.language)}`,
      );
      if (variantId === undefined) {
        continue;
      }
      const rows = stagingByKey.get(skuKey(sv.externalId, sv.finish, sv.language)) ?? [];
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

    // 5. Delete consumed staging rows so the unmatched-products panel
    //    reflects current state.
    const deleteTuples: { externalId: number; finish: string; language: string | null }[] = [];
    for (const sv of upsertValues) {
      const rows = stagingByKey.get(skuKey(sv.externalId, sv.finish, sv.language)) ?? [];
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

    // Staging now mirrors the product's language semantics exactly — NULL for
    // CM/TCG, a real code for CT — so we can pass the product's language
    // straight through without any placeholder.
    for (const snap of snapshots) {
      await trxConfig.insertStagingFromSnapshot(
        {
          externalId: variant.externalId,
          groupId: variant.groupId,
          productName: variant.productName,
        },
        variant.finish,
        variant.language,
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
