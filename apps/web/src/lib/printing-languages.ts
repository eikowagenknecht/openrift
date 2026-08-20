import type { Printing } from "@openrift/shared";

/** One language's printings, as a picker's language tab shows them. */
export interface PrintingLanguageGroup {
  language: string;
  printings: Printing[];
}

/**
 * Groups printings into language tabs. Both printing pickers (the card
 * detail's variant list and the scanner's disambiguation dialog) need the same
 * grouping, and each had grown its own copy.
 *
 * With a `languageOrder` the groups follow the taxonomy's order, and codes the
 * taxonomy doesn't know are appended rather than dropped, so a printing can
 * never become unreachable because its language is missing from /init. Without
 * one, the input's own order is kept, which is what a caller handing over a
 * pre-sorted candidate list wants.
 *
 * @param printings The printings to group; within a language their input order
 *   is preserved.
 * @param languageOrder Taxonomy language codes, when the caller has them.
 * @returns One group per language present, ordered.
 */
export function groupPrintingsByLanguage(
  printings: readonly Printing[],
  languageOrder?: readonly string[],
): PrintingLanguageGroup[] {
  const byLanguage = Map.groupBy(printings, (printing) => printing.language);

  if (!languageOrder) {
    return [...byLanguage].map(([language, group]) => ({ language, printings: group }));
  }

  const known = languageOrder.filter((code) => byLanguage.has(code));
  const unknown = [...byLanguage.keys()].filter((code) => !known.includes(code));
  return [...known, ...unknown].map((language) => ({
    language,
    printings: byLanguage.get(language) ?? [],
  }));
}
