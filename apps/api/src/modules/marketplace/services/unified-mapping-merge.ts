import type {
  AssignableCardResponse,
  MappingGroupHeader,
  MappingPrintingResponse,
  MarketplaceAssignmentResponse,
  MarketplaceGroupKind,
  StagedProductResponse,
  UnifiedMappingGroupResponse,
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared/types/api/admin";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { normalizeNameForIdentity } from "@openrift/shared/utils";

import type { Repos } from "../../../deps.js";
import type { MarketplaceConfig, StagingRow } from "../lib/marketplace-configs.js";
import { buildStagedRowMapping } from "./marketplace-mapping-shared.js";
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
 */
function deriveCardsForMarketplace(
  unifiedRows: UnifiedCardRow[],
  marketplace: Marketplace,
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
    const [firstRow] = rows;
    if (!firstRow) {
      continue;
    }
    const { variantMarketplace: _, ...rest } = firstRow;
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
  groups: (MappingGroupHeader & {
    printings: MappingPrintingResponse[];
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
    assignments: MarketplaceAssignmentResponse[];
  })[];
  unmatchedProducts: StagedProductResponse[];
  allCards: AssignableCardResponse[];
}

export type GetMappingOverview = (
  repos: Repos,
  config: MarketplaceConfig,
  options?: {
    matchedCards?: MatchedCardsRow[];
    allCardsForMatching?: { cardId: string; cardName: string }[];
  },
) => Promise<MappingOverviewResult>;

/**
 * Drop duplicate printings, keeping the first occurrence of each printingId.
 * `buildCardIndex` emits one row per (printing × marketplace variant), so a
 * printing with multiple variants in the same marketplace (e.g. TCG product
 * 653007 having both a normal and a foil SKU bound to the same printing)
 * lands in `group.printings` more than once. The wire response only has one
 * slot per printingId for marketplace IDs, so the duplicates would otherwise
 * surface in the admin Assign dropdown as repeated, all-checked entries.
 */
function dedupePrintingsByPrintingId<T extends { printingId: string }>(printings: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const p of printings) {
    if (seen.has(p.printingId)) {
      continue;
    }
    seen.add(p.printingId);
    result.push(p);
  }
  return result;
}

type MarketplaceSlot = "tcgplayer" | "cardmarket" | "cardtrader";
type RawGroupPrinting = MappingOverviewResult["groups"][number]["printings"][number];
type MergedPrinting = UnifiedMappingGroupResponse["printings"][number];
type MergedGroup = Omit<UnifiedMappingGroupResponse, "primaryShortCode">;

const EXTERNAL_ID_FIELD: Record<
  MarketplaceSlot,
  "tcgExternalId" | "cmExternalId" | "ctExternalId"
> = {
  tcgplayer: "tcgExternalId",
  cardmarket: "cmExternalId",
  cardtrader: "ctExternalId",
};

function emptyMarketplaceSlot(): MergedGroup["tcgplayer"] {
  return { stagedProducts: [], assignedProducts: [], assignments: [] };
}

function toMergedPrinting(p: RawGroupPrinting, marketplace: MarketplaceSlot): MergedPrinting {
  return {
    printingId: p.printingId,
    setId: p.setId,
    shortCode: p.shortCode,
    rarity: p.rarity,
    artVariant: p.artVariant,
    isSigned: p.isSigned,
    isOvernumbered: p.isOvernumbered,
    markerSlugs: p.markerSlugs,
    finish: p.finish,
    size: p.size,
    language: p.language,
    imageUrl: p.imageUrl,
    tcgExternalId: marketplace === "tcgplayer" ? p.externalId : null,
    cmExternalId: marketplace === "cardmarket" ? p.externalId : null,
    ctExternalId: marketplace === "cardtrader" ? p.externalId : null,
  };
}

function mergeMarketplaceIntoMap(
  mergedMap: Map<string, MergedGroup>,
  result: MappingOverviewResult,
  marketplace: MarketplaceSlot,
): void {
  const idField = EXTERNAL_ID_FIELD[marketplace];
  for (const group of result.groups) {
    const printings = dedupePrintingsByPrintingId(group.printings);
    const marketplaceData = {
      stagedProducts: group.stagedProducts,
      assignedProducts: group.assignedProducts,
      assignments: group.assignments,
    };
    const existing = mergedMap.get(group.cardId);
    if (existing) {
      const byPrinting = new Map(printings.map((p) => [p.printingId, p.externalId]));
      for (const p of existing.printings) {
        p[idField] = byPrinting.get(p.printingId) ?? null;
      }
      // Also add printings unique to this marketplace, or their assignments drop out of the unified view.
      const existingIds = new Set(existing.printings.map((p) => p.printingId));
      for (const p of printings) {
        if (!existingIds.has(p.printingId)) {
          existing.printings.push(toMergedPrinting(p, marketplace));
        }
      }
      existing[marketplace] = marketplaceData;
    } else {
      mergedMap.set(group.cardId, {
        cardId: group.cardId,
        cardSlug: group.cardSlug,
        cardName: group.cardName,
        superTypes: group.superTypes,
        domains: group.domains,
        energy: group.energy,
        might: group.might,
        setId: group.setId,
        setName: group.setName,
        printings: printings.map((p) => toMergedPrinting(p, marketplace)),
        tcgplayer: marketplace === "tcgplayer" ? marketplaceData : emptyMarketplaceSlot(),
        cardmarket: marketplace === "cardmarket" ? marketplaceData : emptyMarketplaceSlot(),
        cardtrader: marketplace === "cardtrader" ? marketplaceData : emptyMarketplaceSlot(),
      });
    }
  }
}

function mergeOverviewsByCard(
  tcgResult: MappingOverviewResult,
  cmResult: MappingOverviewResult,
  ctResult: MappingOverviewResult,
): Map<string, MergedGroup> {
  const mergedMap = new Map<string, MergedGroup>();
  mergeMarketplaceIntoMap(mergedMap, tcgResult, "tcgplayer");
  mergeMarketplaceIntoMap(mergedMap, cmResult, "cardmarket");
  mergeMarketplaceIntoMap(mergedMap, ctResult, "cardtrader");
  return mergedMap;
}

function withPrimaryShortCode(mergedMap: Map<string, MergedGroup>): UnifiedMappingGroupResponse[] {
  return [...mergedMap.values()].map((g) => ({
    ...g,
    primaryShortCode: g.printings.reduce(
      (best, p) => (p.shortCode.localeCompare(best) < 0 ? p.shortCode : best),
      g.printings[0]?.shortCode ?? "",
    ),
  }));
}

export async function buildUnifiedMappingsResponse(
  repos: Repos,
  tcgplayerConfig: MarketplaceConfig,
  cardmarketConfig: MarketplaceConfig,
  cardtraderConfig: MarketplaceConfig,
  getMappingOverview: GetMappingOverview,
): Promise<UnifiedMappingsResponse> {
  const unifiedRows = await repos.marketplaceMapping.allCardsWithPrintingsUnified();
  // Every card's (cardId, cardName), not just this marketplace's matched set, or a card
  // absent from one marketplace loses its alias and staging rows get routed to a shorter-prefix match.
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
  const allCards = [tcgResult.allCards, cmResult.allCards, ctResult.allCards].reduce(
    (best, curr) => (curr.length >= best.length ? curr : best),
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

  const [unifiedRows, allCards, allAliases, stagedRaw] = await Promise.all([
    repos.marketplaceMapping.allCardsWithPrintingsUnified(cardIdentifier),
    repos.marketplaceMapping.assignableCards(),
    repos.marketplaceMapping.allCardAliases(),
    repos.marketplaceMapping.stagingForCardAcrossMarketplaces(cardIdentifier, marketplaces),
  ]);

  const [firstUnifiedRow] = unifiedRows;
  if (!firstUnifiedRow) {
    return { group: null, allCards };
  }

  const thisCardId = firstUnifiedRow.cardId;

  // Aliases are checked longest-first so a shorter alias can't shadow a longer one belonging to another card.
  const aliasesByLength = allAliases.toSorted((a, b) => b.normName.length - a.normName.length);
  const stagedForThisCard = stagedRaw.filter((row) => {
    if (row.isOverride) {
      return true;
    }
    const normProduct = normalizeNameForIdentity(row.productName);
    for (const { normName, cardId } of aliasesByLength) {
      if (
        normProduct.startsWith(normName) ||
        (normName.length >= 5 && normProduct.includes(normName))
      ) {
        return cardId === thisCardId;
      }
    }
    // No alias matched: default to keeping the row since SQL already selected it via our alias.
    return true;
  });

  const stagedByMarketplace = Map.groupBy(stagedForThisCard, (row) => row.marketplace);

  const overviewFor = async (config: MarketplaceConfig): Promise<MappingOverviewResult> => {
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
    const groupSetSlugMap = new Map<number, string | null>();
    // Seeds from mapped printings: staging rows are deleted on assignment, so this is
    // the only place assigned products can still resolve their group name and kind.
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
      if (!groupSetSlugMap.has(u.sourceGroupId)) {
        groupSetSlugMap.set(u.sourceGroupId, u.sourceGroupSetSlug);
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
      groupSetSlugMap.set(r.groupId, r.groupSetSlug);
    }

    const mappedPrintingIds = new Set<string>();
    for (const group of cardGroups.values()) {
      for (const p of group.printings) {
        if (p.externalId !== null) {
          mappedPrintingIds.add(p.printingId);
        }
      }
    }
    const { mappedProductInfo, mapStagedRow } = await buildStagedRowMapping(
      config,
      mappedPrintingIds,
      groupNameMap,
      groupKindMap,
      groupSetSlugMap,
    );

    const groups = buildResponseGroups(
      cardGroups,
      stagedByCard,
      overrideMap,
      mappedProductInfo,
      groupNameMap,
      groupKindMap,
      groupSetSlugMap,
      mapStagedRow,
    );

    return { groups, unmatchedProducts: [], allCards: [] } satisfies MappingOverviewResult;
  };

  const [tcgResult, cmResult, ctResult] = await Promise.all([
    overviewFor(tcgplayerConfig),
    overviewFor(cardmarketConfig),
    overviewFor(cardtraderConfig),
  ]);
  const mergedMap = mergeOverviewsByCard(tcgResult, cmResult, ctResult);
  const withPrimary = withPrimaryShortCode(mergedMap);
  const group = withPrimary[0] ?? null;

  return { group, allCards };
}
