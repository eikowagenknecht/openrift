import type { AdminMarketplaceName } from "@openrift/shared";
import {
  marketplaceCarriesLanguage,
  marketplaceFinish,
  normalizeNameForIdentity,
  WellKnown,
} from "@openrift/shared";

import type {
  MappingGroup,
  MappingPrinting,
  StagedProduct,
  UnifiedMappingGroup,
} from "@/lib/price-mappings-types";

const SUGGESTION_THRESHOLD = 100;

export const STRONG_MATCH_THRESHOLD = 150;

const WEAK_MATCH_SCORE = 50;

const PRICE_PREMIUM_THRESHOLD_CENTS = 10_000;

interface Suggestion {
  product: StagedProduct;
  score: number;
}

function extractSuffix(productName: string, cardName: string): string | null {
  const normProduct = normalizeNameForIdentity(productName);
  const normCard = normalizeNameForIdentity(cardName);

  if (normProduct.startsWith(normCard)) {
    return normProduct.slice(normCard.length);
  }

  const idx = normProduct.indexOf(normCard);
  if (idx !== -1) {
    return normProduct.slice(idx + normCard.length);
  }

  const dashIdx = cardName.indexOf(" - ");
  if (dashIdx !== -1) {
    const normBase = normalizeNameForIdentity(cardName.slice(0, dashIdx));
    const baseIdx = normProduct.indexOf(normBase);
    if (baseIdx !== -1) {
      return normProduct.slice(baseIdx + normBase.length);
    }
  }

  return null;
}

/**
 * Populated only when a (finish, language, groupKind) bucket has exactly two
 * products with distinct prices; three or more is left `null` as ambiguous.
 */
type PriceRank = "cheapest" | "priciest";

function scorePrintingProduct(
  printing: MappingPrinting,
  product: StagedProduct,
  cardName: string,
  enforceLanguage: boolean,
  crossLanguageShortCodes: ReadonlySet<string>,
  priceRank: PriceRank | null,
): number {
  // Finish is compared at marketplace granularity: metal and metal-deluxe
  // both collapse to foil, since no marketplace stages them separately.
  const printingMarketplaceFinish = marketplaceFinish(printing.finish.toLowerCase());
  if (printingMarketplaceFinish !== product.finish.toLowerCase()) {
    return -1;
  }

  // Hard filter: a group pinned to an OpenRift set only matches printings of that set.
  if (
    product.groupSetSlug !== null &&
    product.groupSetSlug !== undefined &&
    printing.setId !== product.groupSetSlug
  ) {
    return -1;
  }

  // CardTrader stages per-language SKUs, so language must match there. TCG/CM
  // stage everything as placeholder "EN" regardless of physical language.
  if (enforceLanguage && printing.language !== product.language) {
    return -1;
  }

  let score = 100;

  // On CardTrader one external_id covers one physical card with per-language
  // SKUs, so an EN assignment to a shortCode is strong evidence the SC SKU matches it too.
  if (crossLanguageShortCodes.has(printing.shortCode)) {
    score += 100;
  }

  // Foil products over the threshold are almost always signed/metal
  // printings, but the correlation isn't strong enough to be conclusive.
  const price = product.lowCents ?? product.marketCents ?? product.midCents ?? null;
  if (price !== null && price >= PRICE_PREMIUM_THRESHOLD_CENTS) {
    const isPremiumPrinting =
      printing.isSigned ||
      printing.finish === WellKnown.finish.METAL ||
      printing.finish === WellKnown.finish.METAL_DELUXE;
    if (isPremiumPrinting) {
      score += 40;
    } else {
      score -= 20;
    }
  }

  // The admin-tagged group kind (basic vs. promo/special) is authoritative
  // for marker presence, so the mismatch penalty outweighs the match bonus.
  const hasMarkers = printing.markerSlugs.length > 0;
  if (product.groupKind === "basic") {
    score += hasMarkers ? -80 : 50;
  } else if (product.groupKind === "special") {
    score += hasMarkers ? 50 : -80;
  }

  // In a two-product (finish, language, groupKind) bucket the pricier one is usually the altart.
  if (priceRank === "priciest" && printing.artVariant === WellKnown.artVariant.ALTART) {
    score += 50;
  } else if (priceRank === "cheapest" && printing.artVariant === WellKnown.artVariant.NORMAL) {
    score += 50;
  }

  // Only these three keywords are trusted; an absent one never penalizes,
  // since marketplace naming of variants is inconsistent.
  const suffix = extractSuffix(product.productName, cardName);
  if (suffix !== null) {
    if (
      suffix.includes("metal") &&
      (printing.finish === WellKnown.finish.METAL ||
        printing.finish === WellKnown.finish.METAL_DELUXE)
    ) {
      score += 60;
    }
    if (suffix.includes("overnumbered") && printing.isOvernumbered) {
      score += 60;
    }
    if (suffix.includes("signature") && printing.isSigned && printing.isOvernumbered) {
      score += 60;
    }
  }

  return score;
}

/**
 * Mutual-best-match: a (printing, product) pair is suggested only when each
 * is uniquely the other's top-scoring partner; ties surface nothing.
 */
function computeSuggestions(
  group: MappingGroup,
  marketplace: AdminMarketplaceName,
): Map<string, Suggestion> {
  // Only CardTrader puts language in the SKU, so only there must it match the printing's.
  const enforceLanguage = marketplace === "cardtrader";
  const crossLanguageEvidence = group.crossLanguageEvidence ?? new Map();
  const unmapped = group.printings.filter(
    (p) => p.externalId === null && marketplaceCarriesLanguage(marketplace, p.language),
  );
  const available = group.stagedProducts;

  if (unmapped.length === 0 || available.length === 0) {
    return new Map();
  }

  interface Pair {
    printing: MappingPrinting;
    product: StagedProduct;
    score: number;
  }
  // Language is part of the key: on CardTrader two products can share an
  // (externalId, finish) pair but differ in language (EN vs SC SKUs).
  const productKey = (product: StagedProduct): string =>
    `${product.externalId}|${product.finish}|${product.language ?? ""}`;
  // This 2-tuple key is used where evidence is meant to carry across
  // languages (cross-language and price-rank hints).
  const productKey2 = (product: StagedProduct): string => `${product.externalId}|${product.finish}`;
  const emptyShortCodes: ReadonlySet<string> = new Set();
  // Must see the full bucket (staged + assigned): accepting one suggestion
  // moves a product to assigned, which would otherwise erase a 2-product bucket's signal.
  const priceRankByProduct = buildPriceRankEvidence([...available, ...group.assignedProducts]);

  const pairs: Pair[] = [];
  for (const printing of unmapped) {
    for (const product of available) {
      const crossLanguageShortCodes =
        crossLanguageEvidence.get(productKey2(product)) ?? emptyShortCodes;
      const score = scorePrintingProduct(
        printing,
        product,
        group.cardName,
        enforceLanguage,
        crossLanguageShortCodes,
        priceRankByProduct.get(productKey2(product)) ?? null,
      );
      if (score >= SUGGESTION_THRESHOLD) {
        pairs.push({ printing, product, score });
      }
    }
  }

  const topProductByPrinting = new Map<string, Pair>();
  const printingPairs = Map.groupBy(pairs, (p) => p.printing.printingId);
  for (const [printingId, list] of printingPairs) {
    const top = list.reduce((best, p) => (p.score > best.score ? p : best), list[0]);
    const tied = list.filter((p) => p.score === top.score);
    if (tied.length === 1) {
      topProductByPrinting.set(printingId, top);
    }
  }

  // For language-aggregate products (language === null: Cardmarket,
  // TCGPlayer) a tie among sibling printings is legitimate, since one
  // aggregate price covers all of them.
  const topPrintingsByProduct = new Map<string, Pair[]>();
  const productPairs = Map.groupBy(pairs, (p) => productKey(p.product));
  for (const [key, list] of productPairs) {
    const top = list.reduce((best, p) => (p.score > best.score ? p : best), list[0]);
    const tied = list.filter((p) => p.score === top.score);
    if (tied.length === 1) {
      topPrintingsByProduct.set(key, [top]);
    } else if (top.product.language === null && allSiblings(tied.map((t) => t.printing))) {
      topPrintingsByProduct.set(key, tied);
    }
  }

  const suggestions = new Map<string, Suggestion>();
  for (const [printingId, pair] of topProductByPrinting) {
    const reverseList = topPrintingsByProduct.get(productKey(pair.product)) ?? [];
    if (reverseList.some((r) => r.printing.printingId === printingId)) {
      suggestions.set(printingId, { product: pair.product, score: pair.score });
    }
  }

  return suggestions;
}

function buildPriceRankEvidence(
  products: readonly StagedProduct[],
): ReadonlyMap<string, PriceRank> {
  const productKey = (p: StagedProduct): string => `${p.externalId}|${p.finish}`;
  const priceOf = (p: StagedProduct): number | null =>
    p.lowCents ?? p.marketCents ?? p.midCents ?? null;
  const bucketKey = (p: StagedProduct): string =>
    `${p.finish}::${p.language ?? ""}::${p.groupKind ?? ""}`;

  const byBucket = Map.groupBy(products, bucketKey);
  const out = new Map<string, PriceRank>();
  for (const list of byBucket.values()) {
    if (list.length !== 2) {
      continue;
    }
    const [a, b] = list;
    const priceA = priceOf(a);
    const priceB = priceOf(b);
    if (priceA === null || priceB === null || priceA === priceB) {
      continue;
    }
    const [cheap, pricey] = priceA < priceB ? [a, b] : [b, a];
    out.set(productKey(cheap), "cheapest");
    out.set(productKey(pricey), "priciest");
  }
  return out;
}

/**
 * Two printings are siblings when they share every identity axis except
 * language; language-aggregate marketplaces sell one SKU covering all of them.
 */
function allSiblings(printings: MappingPrinting[]): boolean {
  if (printings.length < 2) {
    return true;
  }
  const [first, ...rest] = printings;
  return rest.every(
    (p) =>
      p.shortCode === first.shortCode &&
      p.finish === first.finish &&
      p.artVariant === first.artVariant &&
      p.isSigned === first.isSigned &&
      arraysEqual(p.markerSlugs, first.markerSlugs),
  );
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export interface ProductSuggestion {
  printingId: string;
  score: number;
  isWeak?: boolean;
}

export function productSuggestionKey(
  marketplace: AdminMarketplaceName,
  externalId: number,
  finish: string,
  language: string | null,
): string {
  return `${marketplace}::${externalId}::${finish}::${language ?? ""}`;
}

/**
 * Inverts `computeSuggestions` into a per-product map for the card-detail
 * marketplace view, run once per marketplace.
 */
export function computeProductSuggestions(
  group: UnifiedMappingGroup,
): Map<string, ProductSuggestion[]> {
  const out = new Map<string, ProductSuggestion[]>();
  for (const marketplace of ["tcgplayer", "cardmarket", "cardtrader"] as const) {
    const perPrinting = computeSuggestions(toMarketplaceGroup(group, marketplace), marketplace);
    for (const [printingId, { product, score }] of perPrinting) {
      const key = productSuggestionKey(
        marketplace,
        product.externalId,
        product.finish,
        product.language,
      );
      const list = out.get(key) ?? [];
      list.push({ printingId, score });
      out.set(key, list);
    }
  }
  // Weak suggestions only fill product keys the strong path didn't cover.
  for (const [key, weakList] of computeWeakProductSuggestions(group)) {
    if (!out.has(key)) {
      out.set(key, weakList);
    }
  }
  return out;
}

/**
 * Weak suggestions for SKUs whose finish matches no printing on the card
 * (e.g. a bogus Cardmarket "normal" listing on a foil-only card): mirror
 * whatever printings a sibling SKU on the same externalId is already mapped to.
 */
function computeWeakProductSuggestions(
  group: UnifiedMappingGroup,
): Map<string, ProductSuggestion[]> {
  const out = new Map<string, ProductSuggestion[]>();
  const cardPrintingFinishes = new Set(
    group.printings.map((p) => marketplaceFinish(p.finish.toLowerCase())),
  );
  for (const marketplace of ["tcgplayer", "cardmarket"] as const) {
    const { stagedProducts, assignedProducts, assignments } = group[marketplace];

    const cardPrintingIds = new Set(
      group.printings
        .filter((p) => marketplaceCarriesLanguage(marketplace, p.language))
        .map((p) => p.printingId),
    );

    const printingsByExternalId = new Map<number, Set<string>>();
    for (const a of assignments) {
      if (!cardPrintingIds.has(a.printingId)) {
        continue;
      }
      const existing = printingsByExternalId.get(a.externalId);
      if (existing === undefined) {
        printingsByExternalId.set(a.externalId, new Set([a.printingId]));
      } else {
        existing.add(a.printingId);
      }
    }

    const assignedKeys = new Set(
      assignedProducts.map((p) => `${p.externalId}|${p.finish}|${p.language ?? ""}`),
    );

    for (const product of stagedProducts) {
      const productKey = `${product.externalId}|${product.finish}|${product.language ?? ""}`;
      if (assignedKeys.has(productKey)) {
        continue;
      }
      if (cardPrintingFinishes.has(product.finish.toLowerCase())) {
        continue;
      }
      const sibling = printingsByExternalId.get(product.externalId);
      if (sibling === undefined || sibling.size === 0) {
        continue;
      }
      const key = productSuggestionKey(
        marketplace,
        product.externalId,
        product.finish,
        product.language,
      );
      out.set(
        key,
        [...sibling].map((printingId) => ({ printingId, score: WEAK_MATCH_SCORE, isWeak: true })),
      );
    }
  }
  return out;
}

/**
 * On CardTrader, an EN SKU's assignment to a short_code is evidence its SC
 * sibling SKU should resolve to the same short_code.
 */
function buildCrossLanguageEvidence(
  group: UnifiedMappingGroup,
  marketplace: AdminMarketplaceName,
): ReadonlyMap<string, ReadonlySet<string>> {
  const assignments = group[marketplace].assignments;
  if (assignments.length === 0) {
    return new Map();
  }
  const shortCodeByPrinting = new Map(group.printings.map((p) => [p.printingId, p.shortCode]));
  const byProduct = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const shortCode = shortCodeByPrinting.get(assignment.printingId);
    if (shortCode === undefined) {
      continue;
    }
    const key = `${assignment.externalId}|${assignment.finish}`;
    const existing = byProduct.get(key);
    if (existing === undefined) {
      byProduct.set(key, new Set([shortCode]));
    } else {
      existing.add(shortCode);
    }
  }
  return byProduct;
}

function toMarketplaceGroup(
  group: UnifiedMappingGroup,
  marketplace: AdminMarketplaceName,
): MappingGroup {
  const mkData = group[marketplace];
  const assignmentByPrinting = new Map<string, number>();
  for (const a of mkData.assignments) {
    if (!assignmentByPrinting.has(a.printingId)) {
      assignmentByPrinting.set(a.printingId, a.externalId);
    }
  }
  return {
    cardId: group.cardId,
    cardSlug: group.cardSlug,
    cardName: group.cardName,
    superTypes: group.superTypes,
    domains: group.domains,
    energy: group.energy,
    might: group.might,
    setId: group.setId,
    setName: group.setName,
    printings: group.printings.map(
      ({ tcgExternalId: _tcg, cmExternalId: _cm, ctExternalId: _ct, ...printing }) => ({
        ...printing,
        externalId: assignmentByPrinting.get(printing.printingId) ?? null,
      }),
    ),
    stagedProducts: mkData.stagedProducts,
    assignedProducts: mkData.assignedProducts,
    // Only CardTrader has per-language SKUs to inherit cross-language evidence from.
    crossLanguageEvidence:
      marketplace === "cardtrader" ? buildCrossLanguageEvidence(group, marketplace) : undefined,
  };
}
