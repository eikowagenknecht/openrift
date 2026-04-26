import type { KeywordsResponse } from "@openrift/shared";

const FALLBACK_COLOR = "#6a6a6a";

/**
 * Builds a reverse map from translated labels to their canonical (English) keyword name.
 * E.g. { "护盾": "Shield", "突袭": "Assault", ... }
 *
 * @returns Map from translated label (lowercased) to canonical keyword name.
 */
export function buildTranslationReverseMap(styles: KeywordsResponse["items"]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, entry] of Object.entries(styles)) {
    if (entry.translations) {
      for (const label of Object.values(entry.translations)) {
        map.set(label.toLowerCase(), canonical);
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
  return reverseMap.get(keyword.toLowerCase()) ?? keyword;
}

export function getKeywordStyle(
  keyword: string,
  styles: KeywordsResponse["items"],
  reverseMap?: Map<string, string>,
): { bg: string; dark: boolean } {
  // Strip trailing numbers (e.g. "Shield 2" → "Shield")
  const base = keyword.replace(/\s+\d+$/, "");
  // Try direct lookup first, then resolve via translation map
  const entry =
    styles[base] ?? (reverseMap ? styles[resolveKeywordCanonical(base, reverseMap)] : undefined);
  return {
    bg: entry?.color ?? FALLBACK_COLOR,
    dark: entry?.darkText ?? false,
  };
}
