import type {
  AssignableCardResponse,
  MarketplaceAssignmentResponse,
  MarketplaceGroupKind,
  StagedProductResponse,
  UnifiedMappingGroupResponse,
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared";
import { normalizeNameForMatching } from "@openrift/shared/utils";

import type { Repos } from "../deps.js";
import type { MarketplaceConfig, StagingRow } from "../routes/admin/marketplace-configs.js";
import { buildCardIndex, buildResponseGroups } from "./marketplace-mapping.js";

type UnifiedCardRow = Awaited<
  ReturnType<Repos["marketplaceMapping"]["allCardsWithPrintingsUnified"]>
>[number];
type MatchedCardsRow = Awaited<
  ReturnType<Repos["marketplaceMapping"]["allCardsWithPrintings"]>
>[number];

/**
 * Derive the per-marketplace `matchedCards` shape from the unified cards query.
 *
 * - Printings with variants in the requested marketplace: one row per matching variant.
 * - Printings without a variant in the requested marketplace: one row with the
 *   variant columns nulled out.
 *
 * Even when a printing has variants in other marketplaces, it must still appear
 * in this marketplace's matchedCards so the card lands in `cardGroups`. Without
 * it, name-matched staged products for that card get marked as matched in
 * `matchStagedProducts`/`buildUnifiedMappingsCardResponse` but attached to no
 * group — they vanish from both the per-card view and the unmatched panel.
 * @returns Per-marketplace matchedCards rows in the same shape as the legacy query.
 */
function deriveCardsForMarketplace(
  unifiedRows: UnifiedCardRow[],
  marketplace: string,
): MatchedCardsRow[] {
  const byPrinting = Map.groupBy(unifiedRows, (r) => r.printingId);
  const result: MatchedCardsRow[] = [];
  for (const rows of byPrinting.values()) {
    const matchingVariants = rows.filter((r) => r.variantMarketplace === marketplace);
    if (matchingVariants.length > 0) {
      for (const row of matchingVariants) {
        const { variantMarketplace: _, ...rest } = row;
        result.push(rest);
      }
      continue;
    }
    const { variantMarketplace: _, ...rest } = rows[0];
    result.push({
      ...rest,
      externalId: null,
      sourceGroupId: null,
      sourceLanguage: null,
      productFinish: null,
    });
  }
  return result;
}

interface MappingOverviewResult {
  groups: {
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
    printings: {
      printingId: string;
      shortCode: string;
      rarity: string;
      artVariant: string;
      isSigned: boolean;
      markerSlugs: string[];
      finish: string;
      language: string;
      imageUrl: string | null;
      externalId: number | null;
    }[];
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
    assignments: MarketplaceAssignmentResponse[];
  }[];
  unmatchedProducts: StagedProductResponse[];
  allCards: AssignableCardResponse[];
}

type GetMappingOverview = (
  repos: Repos,
  config: MarketplaceConfig,
  options?: {
    matchedCards?: MatchedCardsRow[];
    allCardsForMatching?: { cardId: string; cardName: string }[];
  },
) => Promise<MappingOverviewResult>;

/**
 * Merge per-marketplace overview results into a single map keyed by cardId.
 * Each printing carries external IDs from whichever marketplaces have it.
 * @returns Map of cardId → merged group data (without primaryShortCode).
 */
function mergeOverviewsByCard(
  tcgResult: MappingOverviewResult,
  cmResult: MappingOverviewResult,
  ctResult: MappingOverviewResult,
): Map<string, Omit<UnifiedMappingGroupResponse, "primaryShortCode">> {
  const mergedMap = new Map<string, Omit<UnifiedMappingGroupResponse, "primaryShortCode">>();

  // Index TCGplayer groups by cardId
  for (const group of tcgResult.groups) {
    mergedMap.set(group.cardId, {
      cardId: group.cardId,
      cardSlug: group.cardSlug,
      cardName: group.cardName,
      cardType: group.cardType,
      superTypes: group.superTypes,
      domains: group.domains,
      energy: group.energy,
      might: group.might,
      setId: group.setId,
      setName: group.setName,
      printings: group.printings.map((p) => ({
        printingId: p.printingId,
        shortCode: p.shortCode,
        rarity: p.rarity,
        artVariant: p.artVariant,
        isSigned: p.isSigned,
        markerSlugs: p.markerSlugs,
        finish: p.finish,
        language: p.language,
        imageUrl: p.imageUrl,
        tcgExternalId: p.externalId,
        cmExternalId: null,
        ctExternalId: null,
      })),
      tcgplayer: {
        stagedProducts: group.stagedProducts,
        assignedProducts: group.assignedProducts,
        assignments: group.assignments,
      },
      cardmarket: { stagedProducts: [], assignedProducts: [], assignments: [] },
      cardtrader: { stagedProducts: [], assignedProducts: [], assignments: [] },
    });
  }

  // Merge Cardmarket groups
  for (const group of cmResult.groups) {
    const existing = mergedMap.get(group.cardId);
    if (existing) {
      // Add CM external IDs to existing printings
      const cmByPrinting = new Map(group.printings.map((p) => [p.printingId, p.externalId]));
      for (const p of existing.printings) {
        p.cmExternalId = cmByPrinting.get(p.printingId) ?? null;
      }
      // Add printings that only have CM variants — otherwise they vanish from
      // the unified view and any assignment referencing them loses its context.
      const existingIds = new Set(existing.printings.map((p) => p.printingId));
      for (const p of group.printings) {
        if (!existingIds.has(p.printingId)) {
          existing.printings.push({
            printingId: p.printingId,
            shortCode: p.shortCode,
            rarity: p.rarity,
            artVariant: p.artVariant,
            isSigned: p.isSigned,
            markerSlugs: p.markerSlugs,
            finish: p.finish,
            language: p.language,
            imageUrl: p.imageUrl,
            tcgExternalId: null,
            cmExternalId: p.externalId,
            ctExternalId: null,
          });
        }
      }
      existing.cardmarket = {
        stagedProducts: group.stagedProducts,
        assignedProducts: group.assignedProducts,
        assignments: group.assignments,
      };
    } else {
      mergedMap.set(group.cardId, {
        cardId: group.cardId,
        cardSlug: group.cardSlug,
        cardName: group.cardName,
        cardType: group.cardType,
        superTypes: group.superTypes,
        domains: group.domains,
        energy: group.energy,
        might: group.might,
        setId: group.setId,
        setName: group.setName,
        printings: group.printings.map((p) => ({
          printingId: p.printingId,
          shortCode: p.shortCode,
          rarity: p.rarity,
          artVariant: p.artVariant,
          isSigned: p.isSigned,
          markerSlugs: p.markerSlugs,
          finish: p.finish,
          language: p.language,
          imageUrl: p.imageUrl,
          tcgExternalId: null,
          cmExternalId: p.externalId,
          ctExternalId: null,
        })),
        tcgplayer: { stagedProducts: [], assignedProducts: [], assignments: [] },
        cardmarket: {
          stagedProducts: group.stagedProducts,
          assignedProducts: group.assignedProducts,
          assignments: group.assignments,
        },
        cardtrader: { stagedProducts: [], assignedProducts: [], assignments: [] },
      });
    }
  }

  // Merge CardTrader groups
  for (const group of ctResult.groups) {
    const existing = mergedMap.get(group.cardId);
    if (existing) {
      const ctByPrinting = new Map(group.printings.map((p) => [p.printingId, p.externalId]));
      for (const p of existing.printings) {
        p.ctExternalId = ctByPrinting.get(p.printingId) ?? null;
      }
      // Add printings that only have CT variants — otherwise they vanish from
      // the unified view and any assignment referencing them loses its context.
      const existingIds = new Set(existing.printings.map((p) => p.printingId));
      for (const p of group.printings) {
        if (!existingIds.has(p.printingId)) {
          existing.printings.push({
            printingId: p.printingId,
            shortCode: p.shortCode,
            rarity: p.rarity,
            artVariant: p.artVariant,
            isSigned: p.isSigned,
            markerSlugs: p.markerSlugs,
            finish: p.finish,
            language: p.language,
            imageUrl: p.imageUrl,
            tcgExternalId: null,
            cmExternalId: null,
            ctExternalId: p.externalId,
          });
        }
      }
      existing.cardtrader = {
        stagedProducts: group.stagedProducts,
        assignedProducts: group.assignedProducts,
        assignments: group.assignments,
      };
    } else {
      mergedMap.set(group.cardId, {
        cardId: group.cardId,
        cardSlug: group.cardSlug,
        cardName: group.cardName,
        cardType: group.cardType,
        superTypes: group.superTypes,
        domains: group.domains,
        energy: group.energy,
        might: group.might,
        setId: group.setId,
        setName: group.setName,
        printings: group.printings.map((p) => ({
          printingId: p.printingId,
          shortCode: p.shortCode,
          rarity: p.rarity,
          artVariant: p.artVariant,
          isSigned: p.isSigned,
          markerSlugs: p.markerSlugs,
          finish: p.finish,
          language: p.language,
          imageUrl: p.imageUrl,
          tcgExternalId: null,
          cmExternalId: null,
          ctExternalId: p.externalId,
        })),
        tcgplayer: { stagedProducts: [], assignedProducts: [], assignments: [] },
        cardmarket: { stagedProducts: [], assignedProducts: [], assignments: [] },
        cardtrader: {
          stagedProducts: group.stagedProducts,
          assignedProducts: group.assignedProducts,
          assignments: group.assignments,
        },
      });
    }
  }

  return mergedMap;
}

/**
 * Attach a `primaryShortCode` to each merged group (the lex-smallest short
 * code across its printings — used for sorting and as the "canonical" ID).
 * @returns An array of merged groups with primaryShortCode populated.
 */
function withPrimaryShortCode(
  mergedMap: Map<string, Omit<UnifiedMappingGroupResponse, "primaryShortCode">>,
): UnifiedMappingGroupResponse[] {
  return [...mergedMap.values()].map((g) => ({
    ...g,
    primaryShortCode: g.printings.reduce(
      (best, p) => (p.shortCode.localeCompare(best) < 0 ? p.shortCode : best),
      g.printings[0]?.shortCode ?? "",
    ),
  }));
}

/**
 * Merge TCGplayer, Cardmarket, and CardTrader mapping overviews into a unified response.
 * Combines data from all marketplaces per card and computes primary source IDs.
 * @returns Unified mappings response with merged groups, unmatched products, and card list.
 */
export async function buildUnifiedMappingsResponse(
  repos: Repos,
  tcgplayerConfig: MarketplaceConfig,
  cardmarketConfig: MarketplaceConfig,
  cardtraderConfig: MarketplaceConfig,
  getMappingOverview: GetMappingOverview,
): Promise<UnifiedMappingsResponse> {
  // Fetch the heavy cards × printings × images join once for all three marketplaces
  // and project per-marketplace in JS, instead of running it 3× from the DB.
  const unifiedRows = await repos.marketplaceMapping.allCardsWithPrintingsUnified();
  // Every card's (cardId, cardName) for the longest-match tiebreak. Without
  // this, each marketplace's matcher only sees cards in its own `matchedCards`
  // subset — so a card like "Blastcone Fae" that has TCG/CT variants but no
  // CM variant is dropped from CM's name index, and a CM staging row named
  // "Blastcone Fae" falls through to the shorter "Blast Cone" prefix and gets
  // routed to the wrong card.
  const allCardsForMatching: { cardId: string; cardName: string }[] = [];
  const seenCardIds = new Set<string>();
  for (const row of unifiedRows) {
    if (seenCardIds.has(row.cardId)) {
      continue;
    }
    seenCardIds.add(row.cardId);
    allCardsForMatching.push({ cardId: row.cardId, cardName: row.cardName });
  }
  const [tcgResult, cmResult, ctResult] = await Promise.all([
    getMappingOverview(repos, tcgplayerConfig, {
      matchedCards: deriveCardsForMarketplace(unifiedRows, tcgplayerConfig.marketplace),
      allCardsForMatching,
    }),
    getMappingOverview(repos, cardmarketConfig, {
      matchedCards: deriveCardsForMarketplace(unifiedRows, cardmarketConfig.marketplace),
      allCardsForMatching,
    }),
    getMappingOverview(repos, cardtraderConfig, {
      matchedCards: deriveCardsForMarketplace(unifiedRows, cardtraderConfig.marketplace),
      allCardsForMatching,
    }),
  ]);

  const mergedMap = mergeOverviewsByCard(tcgResult, cmResult, ctResult);
  const groups = withPrimaryShortCode(mergedMap);
  groups.sort((a, b) => a.primaryShortCode.localeCompare(b.primaryShortCode));

  // allCards only needs to be sent once (same card pool for all)
  const allCards = [tcgResult.allCards, cmResult.allCards, ctResult.allCards].reduce((best, curr) =>
    curr.length >= best.length ? curr : best,
  );

  return {
    groups,
    unmatchedProducts: {
      tcgplayer: tcgResult.unmatchedProducts,
      cardmarket: cmResult.unmatchedProducts,
      cardtrader: ctResult.unmatchedProducts,
    },
    allCards,
  };
}

/**
 * Build the unified mappings response scoped to a single card. Fetches only
 * the staging rows, overrides, and price snapshots relevant to this card —
 * no marketplace-wide `allStaging` scan, no corpus-wide JS matcher. Cost
 * scales with the card's match footprint (a few dozen rows), not the
 * corpus size.
 *
 * `cardIdentifier` can be either the card UUID or its slug — the repo
 * queries resolve either internally so the route doesn't need a separate
 * slug → id lookup.
 * @returns The merged group for the card (null when the card has no rows) plus the assignable-card list.
 */
export async function buildUnifiedMappingsCardResponse(
  repos: Repos,
  tcgplayerConfig: MarketplaceConfig,
  cardmarketConfig: MarketplaceConfig,
  cardtraderConfig: MarketplaceConfig,
  cardIdentifier: string,
): Promise<UnifiedMappingsCardResponse> {
  const configs = [tcgplayerConfig, cardmarketConfig, cardtraderConfig];
  const marketplaces = configs.map((c) => c.marketplace);

  // One round trip: scoped cards join, assignable-cards list, global alias
  // index for the longest-match tiebreak, and candidate staging rows across
  // all 3 marketplaces.
  const [unifiedRows, allCards, allAliases, stagedRaw] = await Promise.all([
    repos.marketplaceMapping.allCardsWithPrintingsUnified(cardIdentifier),
    repos.marketplaceMapping.assignableCards(),
    repos.marketplaceMapping.allCardAliases(),
    repos.marketplaceMapping.stagingForCardAcrossMarketplaces(cardIdentifier, marketplaces),
  ]);

  if (unifiedRows.length === 0) {
    return { group: null, allCards };
  }

  const thisCardId = unifiedRows[0].cardId;

  // Longest-first alias index across all cards. For each name-matched row
  // (non-override), we find its longest matching alias; if that alias belongs
  // to another card, the row really belongs there, not here.
  const aliasesByLength = allAliases.toSorted((a, b) => b.normName.length - a.normName.length);
  const stagedForThisCard = stagedRaw.filter((row) => {
    if (row.isOverride) {
      return true;
    }
    const normProduct = normalizeNameForMatching(row.productName);
    for (const { normName, cardId } of aliasesByLength) {
      if (
        normProduct.startsWith(normName) ||
        (normName.length >= 5 && normProduct.includes(normName))
      ) {
        return cardId === thisCardId;
      }
    }
    // SQL returned this row via our alias, so we should have found a match.
    // Fall through as a safety net — keep it on our side rather than drop it.
    return true;
  });

  // Partition once; each marketplace loop reads its own slice.
  const stagedByMarketplace = Map.groupBy(stagedForThisCard, (row) => row.marketplace);

  // Per-marketplace response groups — each runs its own priceQuery (for
  // prices on already-mapped printings) in parallel.
  const perMarketplaceResults = await Promise.all(
    configs.map(async (config) => {
      const matchedCards = deriveCardsForMarketplace(unifiedRows, config.marketplace);
      const { cardGroups } = buildCardIndex(matchedCards);
      const rows = stagedByMarketplace.get(config.marketplace) ?? [];

      const stagingRows: StagingRow[] = rows.map((r) => ({
        externalId: r.externalId,
        groupId: r.groupId,
        productName: r.productName,
        finish: r.finish,
        language: r.language,
        recordedAt: r.recordedAt,
        marketCents: r.marketCents,
        lowCents: r.lowCents,
        midCents: r.midCents,
        highCents: r.highCents,
        trendCents: r.trendCents,
        avg1Cents: r.avg1Cents,
        avg7Cents: r.avg7Cents,
        avg30Cents: r.avg30Cents,
      }));

      const stagedByCard = new Map<string, StagingRow[]>();
      if (cardGroups.has(thisCardId) && stagingRows.length > 0) {
        stagedByCard.set(thisCardId, stagingRows);
      }

      const overrideMap = new Map<string, { cardId: string }>();
      const groupNameMap = new Map<number, string>();
      const groupKindMap = new Map<number, MarketplaceGroupKind>();
      // Seed from mapped printings so assigned products resolve their group
      // name and kind even when the card has no current staging rows for that
      // group (staging rows get deleted on assignment).
      for (const u of unifiedRows) {
        if (u.variantMarketplace !== config.marketplace || u.sourceGroupId === null) {
          continue;
        }
        if (typeof u.sourceGroupName === "string") {
          groupNameMap.set(u.sourceGroupId, u.sourceGroupName);
        }
        if (u.sourceGroupKind !== null && u.sourceGroupKind !== undefined) {
          groupKindMap.set(u.sourceGroupId, u.sourceGroupKind);
        }
      }
      for (const r of rows) {
        if (r.isOverride) {
          overrideMap.set(`${r.externalId}::${r.finish}::${r.language}`, { cardId: thisCardId });
        }
        if (r.groupName !== null) {
          groupNameMap.set(r.groupId, r.groupName);
        }
        groupKindMap.set(r.groupId, r.groupKind);
      }

      const mappedPrintingIds = new Set<string>();
      for (const group of cardGroups.values()) {
        for (const p of group.printings) {
          if (p.externalId !== null) {
            mappedPrintingIds.add(p.printingId);
          }
        }
      }
      const mappedProductInfo = new Map<string, ReturnType<MarketplaceConfig["mapPriceRow"]>>();
      if (mappedPrintingIds.size > 0) {
        const mappedRows = await config.priceQuery([...mappedPrintingIds]);
        for (const row of mappedRows) {
          const key = `${row.printingId}::${row.externalId}`;
          if (!mappedProductInfo.has(key)) {
            mappedProductInfo.set(key, config.mapPriceRow(row));
          }
        }
      }

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

      const groups = buildResponseGroups(
        cardGroups,
        stagedByCard,
        overrideMap,
        mappedProductInfo,
        groupNameMap,
        groupKindMap,
        mapStagedRow,
      );

      // Shape a MappingOverviewResult just for mergeOverviewsByCard — the
      // merge function only looks at `.groups`, so the other fields can be
      // empty placeholders.
      return { groups, unmatchedProducts: [], allCards: [] } satisfies MappingOverviewResult;
    }),
  );

  const [tcgResult, cmResult, ctResult] = perMarketplaceResults;
  const mergedMap = mergeOverviewsByCard(tcgResult, cmResult, ctResult);
  const withPrimary = withPrimaryShortCode(mergedMap);
  const group = withPrimary[0] ?? null;

  return { group, allCards };
}
