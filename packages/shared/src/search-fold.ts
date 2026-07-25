/**
 * Search-time text folding.
 *
 * Card data is stored with typographic punctuation: `fixTypography` turns `'`
 * into `’`, `...` into `…`, paired `"` into `“ ”`, and `-1` into `−1` with a
 * real U+2212 MINUS SIGN. None of those characters are reachable from a
 * keyboard, so a raw `includes` comparison makes "Doran's Shield" and
 * "d:-1 might" unfindable. Folding both the query and the haystack through
 * {@link foldForSearch} removes that whole class of miss.
 *
 * The fold is deliberately narrow. It only touches characters that carry no
 * meaning for search:
 *
 * - Compatibility-normalizes (NFKD) and drops combining marks, so `é` matches
 *   `e` and fullwidth `，` matches `,`. Expands the Latin letters NFKD leaves
 *   alone because they are letters in their own right (`ß` → `ss`, `æ` → `ae`).
 * - Collapses every dash variant (including U+2011 NON-BREAKING HYPHEN and
 *   U+2212 MINUS SIGN) onto the ASCII hyphen, which it then *keeps*.
 * - Deletes apostrophes and quote marks outright, so "Doran’s", "Doran's" and
 *   "Dorans" all collapse together.
 *
 * Everything else survives verbatim, and that is the load-bearing part. An
 * earlier draft folded `- . , [ ] • _` to spaces and it made text search worse,
 * not better: `d:−1 might` went from 7 correct hits to 183, and `d:[equip]`
 * went from 14 bracketed-keyword hits to 63, because the markup that made those
 * queries precise dissolved. Brackets, colons, underscores and bullets are
 * meaningful in rules text; they are not noise. Unrecognized characters are
 * kept rather than stripped, which is what keeps CJK card names and artist
 * names searchable (contrast `normalizeNameForMatching`, which deletes them).
 */

/** Every dash variant that should behave like a plain ASCII hyphen. */
const DASH_VARIANTS = /[‐‑‒–—―−]/gu;

/**
 * Apostrophes and quote marks, removed outright so that the presence or absence
 * of one never decides a match. Includes the ASCII forms: by the time a term
 * reaches here `parseSearchTerms` has already consumed `"` as a phrase
 * delimiter, so a surviving quote is a literal the user pasted in.
 */
const IGNORED_MARKS = /['’‘ʼ´`"“”«»]/gu;

/** Combining marks left behind by NFKD (the accent of a decomposed `é`). */
const COMBINING_MARKS = /\p{M}+/gu;

/** Anything that is not a letter or a number, for {@link squashForSearch}. */
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

/**
 * Latin letters that NFKD leaves alone because they are distinct letters rather
 * than accented forms, but which a searcher will type as their ASCII expansion.
 * Applied after lowercasing, so only the lowercase forms need listing. There are
 * none of these in the catalogue yet (EN and SC only), so this is groundwork for
 * the European printings rather than a fix for present data.
 */
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

/**
 * Fold text for search comparison. Apply to both the query term and the value
 * being searched. See the module comment for what is and is not folded.
 *
 * @returns The folded, lowercased text with whitespace collapsed.
 *
 * @example
 * ```ts
 * foldForSearch("Doran’s Shield")   // => "dorans shield"
 * foldForSearch("Doran's Shield")   // => "dorans shield"
 * foldForSearch("Give a unit −1")   // => "give a unit -1"
 * foldForSearch("épéeback")         // => "epeeback"
 * foldForSearch("[Equip]")          // => "[equip]"   (markup preserved)
 * ```
 */
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
 * Fold, then remove every separator, so that a query typed without punctuation
 * still matches. This is what lets `quickdraw` find `Quick-Draw` and `ogn269`
 * find `OGN-269`.
 *
 * **Only apply this to short identifier-like values** (card name, keywords,
 * tags, type, short code, artist), never to rules or flavor text. Squashing
 * prose joins words across boundaries and invents matches: measured against the
 * full catalogue it added 2380 spurious hits, with `the` alone gaining 18.
 *
 * @returns The folded text with all separators removed.
 *
 * @example
 * ```ts
 * squashForSearch("Quick-Draw")       // => "quickdraw"
 * squashForSearch("Kai’Sa, Survivor") // => "kaisasurvivor"
 * squashForSearch("莺之歌")            // => "莺之歌"  (kept, not deleted)
 * ```
 */
export function squashForSearch(text: string): string {
  return foldForSearch(text).replaceAll(NON_ALPHANUMERIC, "");
}

/**
 * Folded-value cache for search haystacks.
 *
 * `filterCards` runs the predicate over every printing on every committed
 * query, and folding is meaningfully more work than the `.toLowerCase()` it
 * replaces (NFKD plus four passes, over rules text that runs to a few hundred
 * characters). Caching by raw string means the cost is paid once per distinct
 * value and every later query is a hash lookup.
 *
 * Keys are catalogue strings, so the cache saturates at roughly the number of
 * distinct card fields and does not grow with user input. Query terms are
 * folded eagerly in `parseSearchTerms` instead, and never land here.
 */
const foldCache = new Map<string, string>();
const squashCache = new Map<string, string>();

/**
 * {@link foldForSearch}, memoized. Use for values pulled from the catalogue.
 *
 * @returns The folded text.
 */
export function foldCached(text: string): string {
  let folded = foldCache.get(text);
  if (folded === undefined) {
    folded = foldForSearch(text);
    foldCache.set(text, folded);
  }
  return folded;
}

/**
 * {@link squashForSearch}, memoized. Use for values pulled from the catalogue.
 *
 * @returns The folded text with all separators removed.
 */
export function squashCached(text: string): string {
  let squashed = squashCache.get(text);
  if (squashed === undefined) {
    squashed = squashForSearch(text);
    squashCache.set(text, squashed);
  }
  return squashed;
}
