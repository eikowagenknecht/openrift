import type { KeywordsResponse } from "@openrift/shared";
import { foldForSearch } from "@openrift/shared";

const FALLBACK_COLOR = "#6a6a6a";

/**
 * Builds a reverse map from translated labels to their canonical (English) keyword name.
 * E.g. { "护盾": "Shield", "突袭": "Assault", ... }
 *
 * Keys are folded with `foldForSearch`, not merely lowercased, because the
 * keyword search in `filters.ts` looks up a folded term. Fold both sides or a
 * translated label containing an apostrophe or an accent never resolves.
 *
 * @returns Map from folded translated label to canonical keyword name.
 */
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

/**
 * Resolves a keyword (in any language) to its canonical English name using the
 * reverse translation map. Falls back to the input if no translation is found.
 *
 * @returns The canonical keyword name.
 */
function resolveKeywordCanonical(keyword: string, reverseMap: Map<string, string>): string {
  return reverseMap.get(foldForSearch(keyword)) ?? keyword;
}

export function getKeywordStyle(
  keyword: string,
  styles: KeywordsResponse["items"],
  reverseMap?: Map<string, string>,
): { bg: string; dark: boolean } {
  // Strip trailing numbers (e.g. "Shield 2" → "Shield")
  const base = keyword.replace(/\s+\d+$/u, "");
  // Try direct lookup first, then resolve via translation map
  const entry =
    styles[base] ?? (reverseMap ? styles[resolveKeywordCanonical(base, reverseMap)] : undefined);
  return {
    bg: entry?.color ?? FALLBACK_COLOR,
    dark: entry?.darkText ?? false,
  };
}
