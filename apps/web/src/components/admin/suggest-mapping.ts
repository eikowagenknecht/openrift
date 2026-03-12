import { normalizeNameForMatching } from "@openrift/shared";

import type { MappingGroup, MappingPrinting, StagedProduct } from "./price-mappings-types";

/** Minimum score for a product to be suggested as a mapping candidate. */
const SUGGESTION_THRESHOLD = 100;

/** Score at or above which a suggestion is considered a strong (high-confidence) match. */
export const STRONG_MATCH_THRESHOLD = 150;

export interface Suggestion {
  product: StagedProduct;
  score: number;
}

/**
 * Extract the suffix of the product name after the card name.
 * Both names are reduced to spaceless slugs, so e.g.
 * product "Ahri Alluring Alternate Art", card "Ahri, Alluring" → "alternateart"
 * @returns The slug suffix, or null if the card name isn't a prefix.
 */
function extractSuffix(productName: string, cardName: string): string | null {
  const normProduct = normalizeNameForMatching(productName);
  const normCard = normalizeNameForMatching(cardName);
  if (!normProduct.startsWith(normCard)) {
    return null;
  }
  return normProduct.slice(normCard.length);
}

/**
 * Infer the art variant from a product name suffix (spaceless slug).
 * @returns The inferred artVariant value, or null if ambiguous.
 */
function inferVariant(suffix: string): string | null {
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

function inferPromo(suffix: string): boolean | null {
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

/**
 * Score how well a staged product matches a printing.
 * @returns A numeric score, or -1 if disqualified.
 */
function scorePrintingProduct(
  printing: MappingPrinting,
  product: StagedProduct,
  cardName: string,
): number {
  // Finish must match
  if (printing.finish.toLowerCase() !== product.finish.toLowerCase()) {
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

  const promo = inferPromo(suffix);
  if (promo !== null) {
    if (promo === printing.isPromo) {
      score += 50;
    } else {
      score -= 80;
    }
  }

  const signed = inferSigned(suffix);
  if (signed !== null) {
    if (signed === printing.isSigned) {
      score += 50;
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
export function computeSuggestions(group: MappingGroup): Map<string, Suggestion> {
  const unmapped = group.printings.filter((p) => p.externalId === null);
  const available = group.stagedProducts;

  if (unmapped.length === 0 || available.length === 0) {
    return new Map();
  }

  // Score all pairs
  const pairs: { printing: MappingPrinting; product: StagedProduct; score: number }[] = [];
  for (const printing of unmapped) {
    for (const product of available) {
      const score = scorePrintingProduct(printing, product, group.cardName);
      if (score >= SUGGESTION_THRESHOLD) {
        pairs.push({ printing, product, score });
      }
    }
  }

  // Sort descending by score
  pairs.sort((a, b) => b.score - a.score);

  // Greedy assignment — key products by externalId+finish since the same
  // externalId can appear as separate staged rows for normal and foil.
  const usedPrintings = new Set<string>();
  const usedProducts = new Set<string>();
  const suggestions = new Map<string, Suggestion>();

  for (const { printing, product, score } of pairs) {
    const productKey = `${product.externalId}|${product.finish}`;
    if (usedPrintings.has(printing.printingId) || usedProducts.has(productKey)) {
      continue;
    }
    usedPrintings.add(printing.printingId);
    usedProducts.add(productKey);
    suggestions.set(printing.printingId, { product, score });
  }

  return suggestions;
}
