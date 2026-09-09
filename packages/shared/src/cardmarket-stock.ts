/**
 * Cardmarket's own vocabulary for stock rows read off a seller's pages. The
 * numbers are the values its listing forms carry, not OpenRift's slugs.
 */

export interface CardmarketStockRow {
  idProduct: number;
  isFoil: boolean;
  idLanguage: number;
  idCondition: number;
  amount: number;
  priceCents: number;
  comment: string;
  isSigned: boolean;
  isAltered: boolean;
}

export const CARDMARKET_UNRESOLVED_REASONS = [
  "unknown-condition",
  "language-not-printed",
  "unknown-product",
  "unmapped-product",
  "no-printing-in-language",
  "ambiguous-printing",
] as const;

export type CardmarketUnresolvedReason = (typeof CARDMARKET_UNRESOLVED_REASONS)[number];

const LANGUAGE_NAMES: Record<number, string> = {
  1: "English",
  2: "French",
  3: "German",
  4: "Spanish",
  5: "Italian",
  6: "Simplified Chinese",
  7: "Japanese",
  8: "Portuguese",
  9: "Russian",
  10: "Korean",
  11: "Traditional Chinese",
  12: "Dutch",
  13: "Polish",
  14: "Czech",
  15: "Hungarian",
  16: "Indonesian",
  17: "Thai",
};

// `languages.code` for the four Riftbound is printed in. An article in any of
// Cardmarket's other languages cannot be a real card.
const PRINTING_LANGUAGES: Record<number, string> = {
  1: "EN",
  2: "FR",
  6: "SC",
  10: "KR",
};

const CONDITION_SLUGS: Record<number, string> = {
  1: "mint",
  2: "near-mint",
  3: "excellent",
  4: "good",
  5: "light-played",
  6: "played",
  7: "poor",
};

const CONDITION_IDS: Record<string, number> = Object.fromEntries(
  Object.entries(CONDITION_SLUGS).map(([id, slug]) => [slug, Number(id)]),
);

export function cardmarketLanguageName(idLanguage: number): string | undefined {
  return LANGUAGE_NAMES[idLanguage];
}

export function printingLanguageForCardmarket(idLanguage: number): string | undefined {
  return PRINTING_LANGUAGES[idLanguage];
}

export function conditionSlugForCardmarket(idCondition: number): string | undefined {
  return CONDITION_SLUGS[idCondition];
}

export function cardmarketConditionId(conditionSlug: string): number | undefined {
  return CONDITION_IDS[conditionSlug];
}
