import { RENAMED_LANGUAGES, WellKnown } from "@openrift/shared";

/**
 * Language vocabulary mapping between the catalog's printed language codes
 * (Riot's codes, e.g. `SC` for Simplified Chinese) and the full names other
 * tools' CSV exports carry. Both directions live here so the exporter and the
 * importer cannot drift, the same way `condition-codes.ts` owns conditions.
 */

/** Full display name written for each code we have one for. */
const CODE_TO_NAME: Record<string, string> = {
  EN: "English",
  FR: "French",
  SC: "Chinese (Simplified)",
};

/**
 * Every accepted spelling, lowercased, mapped back to its catalog code.
 * Traditional Chinese has no code in the catalog, so it stays unrecognized
 * rather than folding into `SC` — a traditional card imported as Simplified
 * would be silently mislabelled.
 */
const NAME_TO_CODE: Record<string, string> = {
  english: WellKnown.language.EN,
  french: "FR",
  français: "FR",
  chinese: WellKnown.language.SC,
  "chinese (simplified)": WellKnown.language.SC,
};

/**
 * The full name for a catalog language code, or the bare code when we have no
 * name for it. Codes without a name still round-trip: `languageCodeFromSource`
 * accepts a bare code back.
 * @returns The exported language cell.
 */
export function languageNameForCode(code: string): string {
  return CODE_TO_NAME[code] ?? code;
}

/** Catalog language codes are two letters (`EN`, `SC`, `KR`, …). */
const LANGUAGE_CODE = /^[A-Za-z]{2}$/u;

/**
 * Maps a source CSV language cell to a catalog language code. Accepts full
 * names, bare catalog codes (so a language with no full name here still
 * round-trips through our own export), and codes retired by a rename. Free
 * text that is neither stays unrecognized rather than becoming a junk code
 * that matches no printing.
 * @returns The catalog code, or undefined for blank/unrecognized values.
 */
export function languageCodeFromSource(language: string | undefined): string | undefined {
  const trimmed = language?.trim();
  if (!trimmed) {
    return undefined;
  }
  const named = NAME_TO_CODE[trimmed.toLowerCase()];
  if (named) {
    return named;
  }
  if (!LANGUAGE_CODE.test(trimmed)) {
    return undefined;
  }
  // A bare code: uppercase it and remap the ones a rename retired ("ZH" → "SC").
  const code = trimmed.toUpperCase();
  return RENAMED_LANGUAGES[code] ?? code;
}
