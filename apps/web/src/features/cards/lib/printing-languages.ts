import type { Printing } from "@openrift/shared/types/catalog";

export interface PrintingLanguageGroup {
  language: string;
  printings: Printing[];
}

/** Unknown language codes are appended, not dropped: dropping one would make its printings unreachable. */
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
