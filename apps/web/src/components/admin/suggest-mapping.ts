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
  const printingOrder = [...pairsByPrinting.entries()].sort(
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
