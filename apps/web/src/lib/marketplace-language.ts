/**
 * Helpers for building marketplace product URLs with language filters.
 *
 * Cardmarket is the only marketplace that usefully supports a language
 * filter on the product page — TCGplayer is effectively English-only for
 * Riftbound, and CardTrader handles language at the listing level. The
 * helpers here return query-string fragments that can be appended to the
 * base product URL; empty string when no filter applies.
 */

/**
 * Cardmarket's numeric language ids for the subset of languages our catalog
 * actually uses. Values taken from Cardmarket's public documentation.
 */
const CARDMARKET_LANGUAGE_CODES: Record<string, number> = {
  EN: 1,
  FR: 2,
  DE: 3,
  ES: 4,
  IT: 5,
  "ZH-CN": 6,
  ZH: 6, // printings.language stores "ZH" — alias to CM's simplified Chinese
  JA: 7,
  PT: 8,
  RU: 9,
  KO: 10,
  "ZH-TW": 11,
};

/**
 * Returns the CM `&language=N` query fragment for a given printing language,
 * or an empty string when the language is unknown/missing.
 *
 * @returns The query fragment to append to the existing Cardmarket URL,
 *          including the leading `&`.
 */
export function cardmarketLangParam(language: string | null | undefined): string {
  if (!language) {
    return "";
  }
  const code = CARDMARKET_LANGUAGE_CODES[language.toUpperCase()];
  return code === undefined ? "" : `&language=${code}`;
}
