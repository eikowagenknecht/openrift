import type {
  AssignableCardResponse,
  MarketplaceAssignmentResponse,
  StagedProductResponse,
  UnifiedMappingGroupResponse,
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { MarketplaceConfig } from "../routes/admin/marketplace-configs.js";

type UnifiedCardRow = Awaited<
  ReturnType<Repos["marketplaceMapping"]["allCardsWithPrintingsUnified"]>
>[number];
type MatchedCardsRow = Awaited<
  ReturnType<Repos["marketplaceMapping"]["allCardsWithPrintings"]>
>[number];

/**
 * Derive the per-marketplace `matchedCards` shape from the unified cards query.
 *
 * Mirrors the SQL filter of `allCardsWithPrintings(marketplace)`:
 * - Keep printings with at least one variant in the requested marketplace
 *   (one row per matching variant).
 * - Keep printings with NO variants in any marketplace (one row, NULL variant
 *   columns).
 * - Drop printings whose only variants are in OTHER marketplaces.
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
    const hasAnyVariant = rows.some((r) => r.variantMarketplace !== null);
    if (!hasAnyVariant) {
      const { variantMarketplace: _, ...rest } = rows[0];
      result.push(rest);
    }
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
 * Combines data from all marketplaces per card, computes primary source IDs,
 * and filters to show only cards with incomplete mappings or staged products.
 * @returns Unified mappings response with merged groups, unmatched products, and card list.
 */
export async function buildUnifiedMappingsResponse(
  repos: Repos,
  tcgplayerConfig: MarketplaceConfig,
  cardmarketConfig: MarketplaceConfig,
  cardtraderConfig: MarketplaceConfig,
  getMappingOverview: GetMappingOverview,
  showAll: boolean,
): Promise<UnifiedMappingsResponse> {
  // Fetch the heavy cards × printings × images join once for all three marketplaces
  // and project per-marketplace in JS, instead of running it 3× from the DB.
  const unifiedRows = await repos.marketplaceMapping.allCardsWithPrintingsUnified();
  const [tcgResult, cmResult, ctResult] = await Promise.all([
    getMappingOverview(repos, tcgplayerConfig, {
      matchedCards: deriveCardsForMarketplace(unifiedRows, tcgplayerConfig.marketplace),
    }),
    getMappingOverview(repos, cardmarketConfig, {
      matchedCards: deriveCardsForMarketplace(unifiedRows, cardmarketConfig.marketplace),
    }),
    getMappingOverview(repos, cardtraderConfig, {
      matchedCards: deriveCardsForMarketplace(unifiedRows, cardtraderConfig.marketplace),
    }),
  ]);

  const mergedMap = mergeOverviewsByCard(tcgResult, cmResult, ctResult);
  const allGroupsWithPrimary = withPrimaryShortCode(mergedMap);
  allGroupsWithPrimary.sort((a, b) => a.primaryShortCode.localeCompare(b.primaryShortCode));

  // Filter after merge so all marketplaces have complete data
  const filteredGroups = showAll
    ? allGroupsWithPrimary
    : allGroupsWithPrimary.filter(
        (g) =>
          g.printings.some(
            (p) => p.tcgExternalId === null || p.cmExternalId === null || p.ctExternalId === null,
          ) ||
          g.tcgplayer.stagedProducts.length > 0 ||
          g.cardmarket.stagedProducts.length > 0 ||
          g.cardtrader.stagedProducts.length > 0,
      );

  // allCards only needs to be sent once (same card pool for all)
  const allCards = [tcgResult.allCards, cmResult.allCards, ctResult.allCards].reduce((best, curr) =>
    curr.length >= best.length ? curr : best,
  );

  return {
    groups: filteredGroups,
    unmatchedProducts: {
      tcgplayer: tcgResult.unmatchedProducts,
      cardmarket: cmResult.unmatchedProducts,
      cardtrader: ctResult.unmatchedProducts,
    },
    allCards,
  };
}

/**
 * Build the unified mappings response scoped to a single card. The heavy
 * cards × printings × variants join and the snapshot price lookup both filter
 * on the card up-front, so the server work is ~100× smaller than the
 * corpus-wide variant. `allCards` is still corpus-wide because it powers the
 * "assign to a different card" dropdown in the UI.
 *
 * `cardIdentifier` can be either the card UUID or its slug — the repo query
 * matches either so the route doesn't need a separate slug → id lookup.
 * @returns The merged group for the card (null when the card has no rows) plus the assignable-card list.
 */
export async function buildUnifiedMappingsCardResponse(
  repos: Repos,
  tcgplayerConfig: MarketplaceConfig,
  cardmarketConfig: MarketplaceConfig,
  cardtraderConfig: MarketplaceConfig,
  getMappingOverview: GetMappingOverview,
  cardIdentifier: string,
): Promise<UnifiedMappingsCardResponse> {
  // Scope the heavy join to this one card, and fetch the assignable-cards list
  // in parallel.
  const [unifiedRows, allCards] = await Promise.all([
    repos.marketplaceMapping.allCardsWithPrintingsUnified(cardIdentifier),
    repos.marketplaceMapping.assignableCards(),
  ]);

  if (unifiedRows.length === 0) {
    return { group: null, allCards };
  }

  // `allCards` covers every card in the corpus — pass it as the name-match
  // tiebreaker so the scoped `matchedCards` (one card here) doesn't let short
  // prefixes steal products that belong to cards with longer aliases.
  const allCardsForMatching = allCards.map((c) => ({
    cardId: c.cardId,
    cardName: c.cardName,
  }));
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
  const withPrimary = withPrimaryShortCode(mergedMap);
  // The repo already filtered to one card, so there's at most one group.
  const group = withPrimary[0] ?? null;

  return { group, allCards };
}
