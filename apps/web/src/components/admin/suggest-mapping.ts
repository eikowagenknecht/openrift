import type { AdminMarketplaceName } from "@openrift/shared";
import { marketplaceFinish, normalizeNameForMatching, WellKnown } from "@openrift/shared";

import type {
  MappingGroup,
  MappingPrinting,
  StagedProduct,
  UnifiedMappingGroup,
} from "./price-mappings-types";

/** Minimum score for a product to be suggested as a mapping candidate. */
const SUGGESTION_THRESHOLD = 100;

/** Score at or above which a suggestion is considered a strong (high-confidence) match. */
export const STRONG_MATCH_THRESHOLD = 150;

/**
 * Products priced at or above this threshold are overwhelmingly signed or
 * metal/metal-deluxe printings (normal-foil listings rarely clear this bar).
 * Used as a soft disambiguator — not conclusive, so the bonus/penalty is
 * smaller than art-variant and finish signals.
 */
const PRICE_PREMIUM_THRESHOLD_CENTS = 10_000;

interface Suggestion {
  product: StagedProduct;
  score: number;
}

/**
 * Extract the suffix of the product name after the card name.
 * Both names are reduced to spaceless slugs, so e.g.
 * product "Ahri Alluring Alternate Art", card "Ahri, Alluring" → "alternateart"
 * product "Jinx Loose Cannon Signature", card "Loose Cannon" → "signature"
 * product "Master Yi Wuju Bladesman", card "Wuju Bladesman - Starter" → ""
 * @returns The slug suffix, or null if the card name can't be found.
 */
function extractSuffix(productName: string, cardName: string): string | null {
  const normProduct = normalizeNameForMatching(productName);
  const normCard = normalizeNameForMatching(cardName);

  // Prefix match (strongest)
  if (normProduct.startsWith(normCard)) {
    return normProduct.slice(normCard.length);
  }

  // Containment match: card name appears inside product (champion prefix)
  const idx = normProduct.indexOf(normCard);
  if (idx !== -1) {
    return normProduct.slice(idx + normCard.length);
  }

  // For cards with " - " suffix, try the base name before the dash
  const dashIdx = cardName.indexOf(" - ");
  if (dashIdx !== -1) {
    const normBase = normalizeNameForMatching(cardName.slice(0, dashIdx));
    const baseIdx = normProduct.indexOf(normBase);
    if (baseIdx !== -1) {
      return normProduct.slice(baseIdx + normBase.length);
    }
  }

  return null;
}

/**
 * Price-rank hint for a product relative to its siblings in the same (finish,
 * language, groupKind) bucket. Only populated when the bucket has exactly two
 * products with distinct prices — that's the case where "the expensive one is
 * the altart" reliably holds. For three or more products the variant order is
 * ambiguous and the hint stays `null`.
 */
type PriceRank = "cheapest" | "priciest";

/**
 * Score how well a staged product matches a printing.
 * @returns A numeric score, or -1 if disqualified.
 */
function scorePrintingProduct(
  printing: MappingPrinting,
  product: StagedProduct,
  cardName: string,
  enforceLanguage: boolean,
  crossLanguageShortCodes: ReadonlySet<string>,
  priceRank: PriceRank | null,
): number {
  // Finish must match — compared at the marketplace's granularity (metal and
  // metal-deluxe printings collapse to foil, since no marketplace surfaces
  // them as distinct staging rows).
  const printingMarketplaceFinish = marketplaceFinish(printing.finish.toLowerCase());
  if (printingMarketplaceFinish !== product.finish.toLowerCase()) {
    return -1;
  }

  // Language must match for per-language marketplaces (CardTrader). The server
  // rejects CT assignments whose printing language doesn't match a staging row,
  // so we must not suggest them. TCG/CM skip this check because their staging
  // is stored as placeholder "EN" regardless of the physical printing language.
  if (enforceLanguage && printing.language !== product.language) {
    return -1;
  }

  let score = 100;

  // Cross-language sibling evidence: on CardTrader, a single external_id maps
  // to one physical card with a per-language SKU, so an EN assignment to
  // `OGN-302*` is strong evidence that the ZH SKU should also resolve to
  // `OGN-302*`. Big boost, since this is a much more reliable signal than the
  // name-suffix inference — the product name alone often can't distinguish
  // signed/non-signed or overnumbered/normal variants of the same card.
  if (crossLanguageShortCodes.has(printing.shortCode)) {
    score += 100;
  }

  // Price-based premium hint: foil products over ~€100/$100 are almost always
  // signed or metal/metal-deluxe printings; normal foils rarely clear that bar.
  // Not conclusive (reprints, regional pricing, outliers), so the swing is
  // smaller than the suffix-derived signals. Asymmetric — the penalty for a
  // non-premium printing on a premium-priced product is softer than the
  // reward for a match, since the correlation cuts more strongly in one
  // direction.
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

  // Group-kind signal: the admin-tagged marketplace group is an authoritative
  // hint for whether the product belongs to a basic set or a promo/special
  // release. A match puts the total at the strong-match threshold (150), the
  // mismatch penalty is heavier so it's hard to overcome without explicit
  // counter-evidence in the name.
  const hasMarkers = printing.markerSlugs.length > 0;
  if (product.groupKind === "basic") {
    score += hasMarkers ? -80 : 50;
  } else if (product.groupKind === "special") {
    score += hasMarkers ? 50 : -80;
  }

  // Price-rank signal: when two products in the same (finish, language,
  // groupKind) bucket differ only in price, the expensive one is almost always
  // the altart and the cheap one the normal. Empirically true for basic-set
  // printings where marketplace product names don't disclose the variant.
  if (priceRank === "priciest" && printing.artVariant === WellKnown.artVariant.ALTART) {
    score += 50;
  } else if (priceRank === "cheapest" && printing.artVariant === WellKnown.artVariant.NORMAL) {
    score += 50;
  }

  // Suffix-based keyword boosts. Positive-only — an absent keyword never
  // penalises a printing, because marketplaces are inconsistent about naming
  // variants (CardTrader especially uses terse names for promos that ship as
  // altart/signed/metal). Only these three keywords are trusted, because they
  // map to a specific printing shape rather than a vague release qualifier.
  const suffix = extractSuffix(product.productName, cardName);
  if (suffix !== null) {
    if (
      suffix.includes("metal") &&
      (printing.finish === WellKnown.finish.METAL ||
        printing.finish === WellKnown.finish.METAL_DELUXE)
    ) {
      score += 60;
    }
    if (
      suffix.includes("overnumbered") &&
      printing.artVariant === WellKnown.artVariant.OVERNUMBERED
    ) {
      score += 60;
    }
    if (
      suffix.includes("signature") &&
      printing.isSigned &&
      printing.artVariant === WellKnown.artVariant.OVERNUMBERED
    ) {
      score += 60;
    }
  }

  return score;
}

/**
 * Compute suggested product assignments for unmapped printings using
 * mutual-best-match: a (printing, product) pair is suggested only when each
 * is uniquely the other's top-scoring partner. Skips cases where multiple
 * printings tie for the same product (e.g. EN/ZH printings of the same card
 * both scoring 100 against a single Cardmarket product) — surfacing nothing
 * is more honest than picking arbitrarily by iteration order.
 * @returns A map from printingId to the suggested product and score.
 */
function computeSuggestions(
  group: MappingGroup,
  options: { enforceLanguage?: boolean } = {},
): Map<string, Suggestion> {
  const enforceLanguage = options.enforceLanguage ?? false;
  const crossLanguageEvidence = group.crossLanguageEvidence ?? new Map();
  const unmapped = group.printings.filter((p) => p.externalId === null);
  const available = group.stagedProducts;

  if (unmapped.length === 0 || available.length === 0) {
    return new Map();
  }

  interface Pair {
    printing: MappingPrinting;
    product: StagedProduct;
    score: number;
  }
  // Key must include language — on CardTrader, two products can share an
  // `(externalId, finish)` pair but differ in language (EN vs ZH SKUs). A
  // 2-tuple key collapses them and the mutual-best gate spuriously treats
  // cross-language candidates as a within-product tie.
  const productKey = (product: StagedProduct): string =>
    `${product.externalId}|${product.finish}|${product.language ?? ""}`;
  // Cross-language evidence and price-rank use a 2-tuple (externalId, finish)
  // because they're meant to carry across languages — a CM/TCG aggregate SKU
  // or a CT sibling-language pair should share the hint.
  const productKey2 = (product: StagedProduct): string => `${product.externalId}|${product.finish}`;
  const emptyShortCodes: ReadonlySet<string> = new Set();
  // Price-rank must see the full bucket — staged + already-assigned — because
  // accepting one suggestion moves its product from staged to assigned, and a
  // 2-product bucket would otherwise collapse to 1 and lose the signal for
  // the remaining sibling product.
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

  // Per-printing top product (skipped if tied within the printing).
  const topProductByPrinting = new Map<string, Pair>();
  const printingPairs = Map.groupBy(pairs, (p) => p.printing.printingId);
  for (const [printingId, list] of printingPairs) {
    const top = list.reduce((best, p) => (p.score > best.score ? p : best), list[0]);
    const tied = list.filter((p) => p.score === top.score);
    if (tied.length === 1) {
      topProductByPrinting.set(printingId, top);
    }
  }

  // Per-product top printing(s). For non-aggregate products (CardTrader, where
  // language is part of the SKU) only a single unique top is accepted —
  // anything else means ambiguity. For language-aggregate products
  // (`product.language === null`: Cardmarket, TCGPlayer), ties among sibling
  // printings (same short_code/finish/art/is_signed/markers, differing only in
  // language) are legitimate — the same aggregate price covers all of them,
  // so every sibling gets its own suggestion chip.
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

  // Emit mutual-best matches: the printing's top product points back to a
  // set of top printings that includes this one.
  const suggestions = new Map<string, Suggestion>();
  for (const [printingId, pair] of topProductByPrinting) {
    const reverseList = topPrintingsByProduct.get(productKey(pair.product)) ?? [];
    if (reverseList.some((r) => r.printing.printingId === printingId)) {
      suggestions.set(printingId, { product: pair.product, score: pair.score });
    }
  }

  return suggestions;
}

/**
 * Within a card's pool of staged products, bucket by (finish, language,
 * groupKind) and rank prices. Only buckets with exactly two products and
 * distinct prices yield a `cheapest` / `priciest` label — we don't try to
 * resolve 3-way variant orderings here, since the only reliable signal is
 * the binary normal-vs-altart split.
 * @returns Map keyed by `productKey(product)` → `"cheapest" | "priciest"`.
 */
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
 * Two printings are "siblings" when they share every printing-identity axis
 * except language — same short_code, finish, art variant, signed state, and
 * marker set. Language-aggregate marketplaces (CM, TCG) sell one SKU covering
 * every sibling, so the suggester treats them as interchangeable targets.
 * @returns true iff every printing in the list matches the first on those axes.
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

/** Product-centric suggestion: for a given marketplace product, the printing it likely belongs to. */
export interface ProductSuggestion {
  printingId: string;
  score: number;
}

/**
 * Stable key for a product row across a unified group (same shape the
 * marketplace-products-table uses to dedupe and render rows).
 * @returns `${marketplace}::${externalId}::${finish}::${language}`
 */
export function productSuggestionKey(
  marketplace: AdminMarketplaceName,
  externalId: number,
  finish: string,
  language: string | null,
): string {
  return `${marketplace}::${externalId}::${finish}::${language ?? ""}`;
}

/**
 * Invert `computeSuggestions` into a per-product map for the card-detail
 * marketplace view, which is product-centric (each row is a product, the user
 * picks the printing). The algorithm runs once per marketplace. A product can
 * appear with multiple suggested printings when it's language-aggregate and
 * those printings are siblings — the admin clicks through each chip to
 * materialise the mapping explicitly.
 * @returns Map keyed by `productSuggestionKey(...)` → one or more suggested printings.
 */
export function computeProductSuggestions(
  group: UnifiedMappingGroup,
): Map<string, ProductSuggestion[]> {
  const out = new Map<string, ProductSuggestion[]>();
  for (const marketplace of ["tcgplayer", "cardmarket", "cardtrader"] as const) {
    const perPrinting = computeSuggestions(toMarketplaceGroup(group, marketplace), {
      enforceLanguage: marketplace === "cardtrader",
    });
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
  return out;
}

/**
 * Collect per-marketplace assignments into `(externalId, finish) → short_codes`.
 * On CardTrader this powers cross-language transfer: if the EN SKU of product
 * 345503 is bound to `OGN-302*`, scoring its ZH SKU gets evidence that the
 * same short_code is the right target. Keys match the scorer's internal
 * product key so lookups don't need to reconstruct the string.
 * @returns Map keyed by `${externalId}|${finish}`, or empty if no assignments.
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
  // Collapse multi-assignment printings to their first externalId — the
  // algorithm only needs "is this printing mapped at all?" semantics.
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
      externalId: assignmentByPrinting.get(p.printingId) ?? null,
    })),
    stagedProducts: mkData.stagedProducts,
    assignedProducts: mkData.assignedProducts,
    // Only CardTrader has per-language SKUs; on TCG/CM every language shares
    // one product, so there's no other-language sibling to inherit from.
    crossLanguageEvidence:
      marketplace === "cardtrader" ? buildCrossLanguageEvidence(group, marketplace) : undefined,
  };
}
