/**
 * Do not unify with `normalizeNameForIdentity` (utils.ts): it must not fold
 * accents, or a dedup key would merge distinct letters. This function does
 * not strip brackets, colons, underscores, or bullets: rules text uses them meaningfully.
 */

const DASH_VARIANTS = /[‐‑‒–—―−]/gu;

const IGNORED_MARKS = /['’‘ʼ´`"“”«»]/gu;

const COMBINING_MARKS = /\p{M}+/gu;

const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

const LIGATURES: Readonly<Record<string, string>> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ð: "d",
  þ: "th",
  đ: "d",
  ł: "l",
  ı: "i",
};
const LIGATURE_PATTERN = new RegExp(`[${Object.keys(LIGATURES).join("")}]`, "gu");

/** Apply to both the query term and the value being searched. */
export function foldForSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replaceAll(COMBINING_MARKS, "")
    .toLowerCase()
    .replaceAll(LIGATURE_PATTERN, (char) => LIGATURES[char] ?? char)
    .replaceAll(DASH_VARIANTS, "-")
    .replaceAll(IGNORED_MARKS, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/**
 * Only apply to short identifier-like values (card name, keywords, tags, type,
 * short code, artist), never rules or flavor text: squashing prose invents matches.
 */
export function squashForSearch(text: string): string {
  return foldForSearch(text).replaceAll(NON_ALPHANUMERIC, "");
}

/**
 * Keyed by catalogue string, not query input, so the cache saturates instead
 * of growing unbounded; query terms are folded eagerly in `parseSearchTerms`.
 */
const foldCache = new Map<string, string>();
const squashCache = new Map<string, string>();

/** {@link foldForSearch}, memoized. Use for values pulled from the catalogue. */
export function foldCached(text: string): string {
  let folded = foldCache.get(text);
  if (folded === undefined) {
    folded = foldForSearch(text);
    foldCache.set(text, folded);
  }
  return folded;
}

/** {@link squashForSearch}, memoized. Use for values pulled from the catalogue. */
export function squashCached(text: string): string {
  let squashed = squashCache.get(text);
  if (squashed === undefined) {
    squashed = squashForSearch(text);
    squashCache.set(text, squashed);
  }
  return squashed;
}
