import type {
  StagedProductResponse,
  UnifiedMappingGroupResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import type { MarketplaceConfig } from "../routes/admin/marketplace-configs.js";

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
      promoTypeSlug: string | null;
      finish: string;
      collectorNumber: number;
      imageUrl: string | null;
      externalId: number | null;
    }[];
    stagedProducts: StagedProductResponse[];
    assignedProducts: StagedProductResponse[];
  }[];
  unmatchedProducts: StagedProductResponse[];
  allCards: {
    cardId: string;
    cardName: string;
    setId: string;
    setName: string;
    printings: {
      printingId: string;
      shortCode: string;
      finish: string;
      collectorNumber: number;
      isSigned: boolean;
      externalId: number | null;
    }[];
  }[];
}

/**
 * Merge TCGplayer and Cardmarket mapping overviews into a unified response.
 * Combines data from both marketplaces per card, computes primary source IDs,
 * and filters to show only cards with incomplete mappings or staged products.
 * @returns Unified mappings response with merged groups, unmatched products, and card list.
 */
export async function buildUnifiedMappingsResponse(
  db: Kysely<Database>,
  tcgplayerConfig: MarketplaceConfig,
  cardmarketConfig: MarketplaceConfig,
  getMappingOverview: (
    db: Kysely<Database>,
    config: MarketplaceConfig,
  ) => Promise<MappingOverviewResult>,
  showAll: boolean,
): Promise<UnifiedMappingsResponse> {
  const [tcgResult, cmResult] = await Promise.all([
    getMappingOverview(db, tcgplayerConfig),
    getMappingOverview(db, cardmarketConfig),
  ]);

  // Merge by cardId — combine data from both marketplaces per card
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
        promoTypeSlug: p.promoTypeSlug,
        finish: p.finish,
        collectorNumber: p.collectorNumber,
        imageUrl: p.imageUrl,
        tcgExternalId: p.externalId,
        cmExternalId: null,
      })),
      tcgplayer: {
        stagedProducts: group.stagedProducts,
        assignedProducts: group.assignedProducts,
      },
      cardmarket: { stagedProducts: [], assignedProducts: [] },
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
      existing.cardmarket = {
        stagedProducts: group.stagedProducts,
        assignedProducts: group.assignedProducts,
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
          promoTypeSlug: p.promoTypeSlug,
          finish: p.finish,
          collectorNumber: p.collectorNumber,
          imageUrl: p.imageUrl,
          tcgExternalId: null,
          cmExternalId: p.externalId,
        })),
        tcgplayer: { stagedProducts: [], assignedProducts: [] },
        cardmarket: {
          stagedProducts: group.stagedProducts,
          assignedProducts: group.assignedProducts,
        },
      });
    }
  }

  // Compute primaryShortCode for each group and pre-sort
  const allGroupsWithPrimary: UnifiedMappingGroupResponse[] = [...mergedMap.values()].map((g) => ({
    ...g,
    primaryShortCode: g.printings.reduce(
      (best, p) => (p.shortCode.localeCompare(best) < 0 ? p.shortCode : best),
      g.printings[0]?.shortCode ?? "",
    ),
  }));
  allGroupsWithPrimary.sort((a, b) => a.primaryShortCode.localeCompare(b.primaryShortCode));

  // Filter after merge so both marketplaces have complete data
  const filteredGroups = showAll
    ? allGroupsWithPrimary
    : allGroupsWithPrimary.filter(
        (g) =>
          g.printings.some((p) => p.tcgExternalId === null || p.cmExternalId === null) ||
          g.tcgplayer.stagedProducts.length > 0 ||
          g.cardmarket.stagedProducts.length > 0,
      );

  // allCards only needs to be sent once (same card pool for both)
  const allCards =
    tcgResult.allCards.length >= cmResult.allCards.length ? tcgResult.allCards : cmResult.allCards;

  return {
    groups: filteredGroups,
    unmatchedProducts: {
      tcgplayer: tcgResult.unmatchedProducts,
      cardmarket: cmResult.unmatchedProducts,
    },
    allCards,
  };
}
