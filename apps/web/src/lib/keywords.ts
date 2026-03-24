import type { KeywordStylesResponse } from "@openrift/shared";

const FALLBACK_COLOR = "#6a6a6a";

export function getKeywordStyle(
  keyword: string,
  styles: KeywordStylesResponse["items"],
): { bg: string; dark: boolean } {
  // Strip trailing numbers (e.g. "Shield 2" → "Shield")
  const base = keyword.replace(/\s+\d+$/, "");
  const entry = styles[base];
  return {
    bg: entry?.color ?? FALLBACK_COLOR,
    dark: entry?.darkText ?? false,
  };
}
