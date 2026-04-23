import type { AdminMarketplaceName, ArtVariant } from "@openrift/shared";
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
 * Infer the art variant from a product name suffix (spaceless slug).
 * @returns The inferred artVariant value, or null if ambiguous.
 */
function inferVariant(suffix: string): ArtVariant | null {
  if (suffix === "") {
    return "normal";
  }
  if (suffix.includes("alternateart")) {
    return "altart";
  }
  if (suffix.includes("overnumbered")) {
    return "overnumbered";
  }
  return null;
}

function inferIsPromo(suffix: string): boolean | null {
  if (
    suffix.includes("launchexclusive") ||
    suffix.includes("exclusive") ||
    suffix.includes("promo")
  ) {
    return true;
  }
  return null;
}

function inferSigned(suffix: string): boolean | null {
  if (suffix.includes("signed") || suffix.includes("signature")) {
    return true;
  }
  return null;
}

function inferIsMetal(suffix: string): boolean {
  return suffix.includes("metal");
}

/**
 * Score how well a staged product matches a printing.
 * @returns A numeric score, or -1 if disqualified.
 */
function scorePrintingProduct(
  printing: MappingPrinting,
  product: StagedProduct,
  cardName: string,
  enforceLanguage: boolean,
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

  const suffix = extractSuffix(product.productName, cardName);
  if (suffix === null) {
    return score;
  }

  const variant = inferVariant(suffix);
  if (variant !== null) {
    if (variant === printing.artVariant) {
      score += 50;
    } else {
      score -= 80;
    }
  }

  const promo = inferIsPromo(suffix);
  if (promo !== null) {
    const isPromo = printing.markerSlugs.length > 0;
    if (promo === isPromo) {
      score += 50;
    } else {
      score -= 80;
    }
  }

  const signed = inferSigned(suffix);
  if (signed !== null) {
    if (signed === printing.isSigned) {
      score += 60;
    } else {
      score -= 80;
    }
  }

  // Metal disambiguation: within the foil equivalence class, a metal printing
  // should prefer the foil-staging product whose name contains "Metal", and a
  // regular foil printing should avoid it. Only relevant for foil staging —
  // normal printings already filter out via the finish gate above.
  if (product.finish.toLowerCase() === WellKnown.finish.FOIL) {
    const metalProduct = inferIsMetal(suffix);
    const metalPrinting =
      printing.finish === WellKnown.finish.METAL ||
      printing.finish === WellKnown.finish.METAL_DELUXE;
    if (metalProduct === metalPrinting) {
      score += 60;
    } else {
      score -= 80;
    }
  }

  return score;
}

/**
 * Compute suggested product assignments for unmapped printings.
 * Uses greedy matching: highest-scoring pairs are assigned first.
 * @returns A map from printingId to the suggested product and score.
 */
export function computeSuggestions(
  group: MappingGroup,
  options: { enforceLanguage?: boolean } = {},
): Map<string, Suggestion> {
  const enforceLanguage = options.enforceLanguage ?? false;
  const unmapped = group.printings.filter((p) => p.externalId === null);
  const available = group.stagedProducts;

  if (unmapped.length === 0 || available.length === 0) {
    return new Map();
  }

  // Score all pairs
  const pairs: { printing: MappingPrinting; product: StagedProduct; score: number }[] = [];
  for (const printing of unmapped) {
    for (const product of available) {
      const score = scorePrintingProduct(printing, product, group.cardName, enforceLanguage);
      if (score >= SUGGESTION_THRESHOLD) {
        pairs.push({ printing, product, score });
      }
    }
  }

  // Group pairs by printing, sorted by score descending within each group
  const pairsByPrinting = new Map<string, typeof pairs>();
  for (const pair of pairs) {
    const list = pairsByPrinting.get(pair.printing.printingId) ?? [];
    list.push(pair);
    pairsByPrinting.set(pair.printing.printingId, list);
  }
  for (const list of pairsByPrinting.values()) {
    list.sort((a, b) => b.score - a.score);
  }

  // Process printings in order of their best score (highest first)
  const printingOrder = [...pairsByPrinting.entries()].toSorted(
    ([, a], [, b]) => b[0].score - a[0].score,
  );

  // Greedy assignment with dynamic tie detection: for each printing, check if
  // its best score among *remaining* products is tied. If so, the match is
  // ambiguous — skip it. Otherwise assign the single best product.
  const usedProducts = new Set<string>();
  const suggestions = new Map<string, Suggestion>();

  for (const [, printingPairs] of printingOrder) {
    const remaining = printingPairs.filter(
      (p) => !usedProducts.has(`${p.product.externalId}|${p.product.finish}`),
    );
    if (remaining.length === 0) {
      continue;
    }
    const topScore = remaining[0].score;
    const tiedAtTop = remaining.filter((p) => p.score === topScore);
    if (tiedAtTop.length > 1) {
      continue;
    }
    const best = tiedAtTop[0];
    const productKey = `${best.product.externalId}|${best.product.finish}`;
    usedProducts.add(productKey);
    suggestions.set(best.printing.printingId, { product: best.product, score: best.score });
  }

  return suggestions;
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
  language: string,
): string {
  return `${marketplace}::${externalId}::${finish}::${language}`;
}

/**
 * Invert `computeSuggestions` into a per-product map for the card-detail
 * marketplace view, which is product-centric (each row is a product, the user
 * picks the printing). The algorithm runs once per marketplace — a product
 * appears in the result only if it's the unique best match for exactly one
 * unmapped printing.
 * @returns Map keyed by `productSuggestionKey(...)` → the suggested printing.
 */
export function computeProductSuggestions(
  group: UnifiedMappingGroup,
): Map<string, ProductSuggestion> {
  const out = new Map<string, ProductSuggestion>();
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
      out.set(key, { printingId, score });
    }
  }
  return out;
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
  };
}
