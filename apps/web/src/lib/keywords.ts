import type { KeywordsResponse } from "@openrift/shared";
import { foldForSearch } from "@openrift/shared";

const FALLBACK_COLOR = "#6a6a6a";

/** Keys must use `foldForSearch`, matching the lookup in `filters.ts`. */
export function buildTranslationReverseMap(styles: KeywordsResponse["items"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, entry] of Object.entries(styles)) {
    if (entry.translations) {
      for (const label of Object.values(entry.translations)) {
        map.set(foldForSearch(label), canonical);
      }
    }
  }
  return map;
}

function resolveKeywordCanonical(keyword: string, reverseMap: Map<string, string>): string {
  return reverseMap.get(foldForSearch(keyword)) ?? keyword;
}

export function getKeywordStyle(
  keyword: string,
  styles: KeywordsResponse["items"],
  reverseMap?: Map<string, string>,
): { bg: string; dark: boolean } {
  const base = keyword.replace(/\s+\d+$/u, "");
  const entry =
    styles[base] ?? (reverseMap ? styles[resolveKeywordCanonical(base, reverseMap)] : undefined);
  return {
    bg: entry?.color ?? FALLBACK_COLOR,
    dark: entry?.darkText ?? false,
  };
}
