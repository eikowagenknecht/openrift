import type { Card, CardType, Printing } from "./types/index.js";
import { WellKnown } from "./well-known.js";

/**
 * Converts a card name to a URL-friendly slug.
 * Example: "Ahri, Alluring" → "ahri-alluring"
 * @returns A lowercase, hyphen-separated slug.
 */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

/** The fields {@link legendDisplayName} reads, as the catalog spells them. */
export interface CardNameParts {
  name: string;
  types: readonly CardType[];
  tags: readonly string[];
}

/**
 * Build the display name for a card, prepending a Legend's champion tag.
 *
 * Riftbound Legends carry a proper name (e.g. "Emperor of the Sands") and a
 * single champion-identifier tag (e.g. "Azir"). Players colloquially call the
 * Legend by its champion, and other sites render the combined "Azir, Emperor
 * of the Sands". This composes that label at render time without touching the
 * stored `name`. Non-Legends, and Legends without a tag, return `name`
 * unchanged; a Legend with multiple tags uses the first.
 *
 * @returns `"{tag}, {name}"` for tagged Legends, otherwise the card's `name`.
 */
export function legendDisplayName(card: CardNameParts): string {
  if (!card.types.includes(WellKnown.cardType.LEGEND) || card.tags.length === 0) {
    return card.name;
  }
  const tag = card.tags[0];
  // A stored name that already leads with the champion ("Sett, Kingpin") is
  // left alone, so composing twice can't produce "Sett, Sett, Kingpin".
  if (card.name.startsWith(`${tag}, `)) {
    return card.name;
  }
  return `${tag}, ${legendEpithet(card.name)}`;
}

/**
 * The part of a Legend's printed name players actually say.
 *
 * A Legend is named for a bare epithet ("Emperor of the Sands"), so a comma in
 * one is not separating two halves of a name the way it does on a champion unit
 * ("Garen, Crownguard"). It qualifies the print run, as on the four cards whose
 * faces read "Dark Child, Starter". Nobody says that half aloud, and keeping it
 * would make the champion form three segments instead of two.
 *
 * This trims the label only. `cards.name` stores what is printed on the card
 * and must keep doing so, which is also why `n:starter` still finds these.
 *
 * @returns The name up to its first comma.
 */
function legendEpithet(name: string): string {
  const comma = name.indexOf(", ");
  return comma === -1 ? name : name.slice(0, comma);
}

/**
 * Compares two cards by the name the user actually reads, so a sorted list
 * files a Legend under its champion ("Azir, Emperor of the Sands" under A) and
 * agrees with the label beside it. Sorting on the stored `name` was what put
 * Azir under E.
 *
 * @returns A `localeCompare` result over the two display names.
 */
export function compareCardDisplayName(left: CardNameParts, right: CardNameParts): number {
  return legendDisplayName(left).localeCompare(legendDisplayName(right));
}

/**
 * The other names a card answers to in search, for `SearchableCard.altNames`.
 *
 * One definition so a surface cannot decide on its own that Legends are or are
 * not findable by their champion. Three separate hand-rolled versions of this
 * used to exist (a display-name remap in the collection palette, a
 * `lookupByTagAndName` in each import matcher, and `legendComboResolutions` in
 * deck-check), which is why the same query behaved differently depending on
 * where it was typed.
 *
 * @param card The card whose colloquial Legend form should be included.
 * @param extra Further names the caller can reach: a printing's localized
 *   `printedName`, or curated `card_name_aliases` keys on the server. Nullish
 *   and duplicate entries are dropped.
 * @returns The alternate names, never including the canonical `card.name`.
 *
 * @example
 * ```ts
 * cardSearchAltNames({ name: "Emperor of the Sands", types: ["legend"], tags: ["Azir"] })
 * // => ["Azir, Emperor of the Sands"]
 * ```
 */
export function cardSearchAltNames(
  card: Pick<Card, "name" | "types" | "tags">,
  extra?: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>([card.name]);
  const out: string[] = [];
  for (const name of [legendDisplayName(card), ...(extra ?? [])]) {
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Splits a deck's Legend/champion pair into the champion they share plus the
 * two epithets, so a deck's identity line can name the champion once.
 *
 * In constructed the Legend's champion tag must match its champion unit, which
 * makes the plain pairing read "Mel, Soul's Reflection · Mel, Newly Awakened".
 * When both sides name the same champion this returns `character: "Mel"` with
 * the epithets "Soul's Reflection" and "Newly Awakened". Otherwise (freeform
 * decks, a half-built deck, a Legend without a tag) `character` stays unset and
 * `legend` / `champion` keep their full names.
 *
 * @returns `{ character?, legend?, champion? }` — the shared champion when
 * there is one, and the label to render for each side of the pair.
 */
export function deckIdentityLabels(
  legend?: Pick<Card, "name" | "types" | "tags">,
  champion?: Pick<Card, "name">,
): { character?: string; legend?: string; champion?: string } {
  const legendLabel = legend ? legendDisplayName(legend) : undefined;
  const character =
    legend !== undefined && legend.types.includes(WellKnown.cardType.LEGEND)
      ? legend.tags[0]
      : undefined;
  // The champion unit stores the champion in its own name ("Mel, Newly
  // Awakened"), so the prefix is what gets factored out. Matching on the name
  // rather than on the unit's tags keeps the slice honest: no prefix, no split.
  const prefix = character === undefined ? undefined : `${character}, `;
  if (prefix === undefined || champion === undefined || !champion.name.startsWith(prefix)) {
    return { legend: legendLabel, champion: champion?.name };
  }
  return {
    character,
    legend: legend === undefined ? undefined : legendEpithet(legend.name),
    champion: champion.name.slice(prefix.length),
  };
}

/**
 * Deduplicates an array, preserving insertion order.
 *
 * @returns A new array with duplicates removed.
 */
export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Format a human-readable printing label from its component fields.
 * The language (when known) is always prepended as a `LANG:` prefix —
 * including EN, so every labelled printing reads symmetrically. If language
 * is null/undefined the prefix is omitted. Marker slugs are joined with `+`
 * (e.g. `top-8+promo`) and the segment is empty for unmarked printings.
 * A non-standard physical size (e.g. `oversized`) is appended as a trailing
 * `:{size}` segment so an oversized print is distinguishable from its
 * identical-art standard twin; standard printings keep the unchanged label.
 * @returns Display label: "[LANG:]{short_code}:{marker_slugs|}:{finish}[:{size}]"
 */
export function formatPrintingLabel(
  shortCode: string,
  markerSlugs: readonly string[],
  finish: string,
  language?: string | null,
  size?: string | null,
): string {
  let base = `${shortCode}:${markerSlugs.join("+")}:${finish}`;
  if (size && size !== WellKnown.cardSize.STANDARD) {
    base = `${base}:${size}`;
  }
  if (language) {
    return `${language}:${base}`;
  }
  return base;
}

/**
 * Letters and digits of any script. Deliberately `\p{Nd}` + `\p{Nl}` rather
 * than the broader `\p{N}`: PostgreSQL's `[[:alnum:]]` keeps decimal digits
 * (`٣`) and letter-numbers (`Ⅻ`) but drops other-numbers (`½`, `²`, `①`), and
 * the two definitions have to agree character for character — see
 * {@link normalizeNameForIdentity}.
 */
const NAME_MATCH_KEEP = /[^\p{L}\p{Nd}\p{Nl}]/gu;

/**
 * Normalize a card/product name into an **identity key**.
 * Strips whitespace, punctuation and symbols, producing a spaceless lowercase
 * key so that names like "Kai'Sa, Survivor" / "KaiSa Survivor" and "Mega-Mech"
 * / "Mega Mech" all compare equal.
 *
 * **This is not a search helper.** Identity keys answer "are these two rows the
 * same card?" for dedup, grouping and the `norm_name` columns. Search answers
 * "what did the user mean?" and lives in `search-fold.ts` / `card-search.ts`.
 * The two want opposite things from accents, which is why they are separate
 * functions: an identity key must not fold them (see below), and search must.
 * This one used to serve both, and search inherited the no-folding compromise.
 * Reaching for it to match user input reintroduces that bug.
 *
 * **Letters are kept whatever their script.** An earlier `[^a-z0-9]` form
 * deleted every non-Latin character, so a name written entirely in Chinese,
 * Japanese, Korean, Cyrillic or Greek normalized to `""` — and because this
 * value is used as a grouping and matching key, every such name silently
 * collided into a single bucket. Accents are *not* folded (`é` stays `é`):
 * NFKD folding would merge letters that are genuinely distinct in some
 * scripts (Cyrillic `й` decomposes to `и`), reintroducing the same class of
 * collision this function exists to avoid.
 *
 * **This is duplicated in SQL and the two must not drift.** The Postgres
 * mirror is `regexp_replace(lower(name), '[^[:alnum:]]', '', 'g')`, used by
 * the `cards_set_norm_name()`, `candidate_cards_set_norm_name()` and
 * `marketplace_product_compute_norm_name()` trigger functions. `lower()` is
 * applied *before* the strip on both sides, because casing a character can
 * introduce a combining mark (`İ` → `i` + U+0307) that the strip must then
 * remove. Any change here needs a matching migration and a backfill.
 *
 * A name with no letters or digits at all (`"!?!"`) still normalizes to `""`.
 * That is unavoidable for a content-derived key, so callers must not group or
 * build links on an empty result — see `buildCandidateCardSummaries`.
 *
 * @returns A lowercased letters-and-digits-only key (e.g. "kaisasurvivor"),
 * or `""` when the name contains no letters or digits.
 */
export function normalizeNameForIdentity(name: string): string {
  return name.toLowerCase().replaceAll(NAME_MATCH_KEEP, "");
}

/**
 * Replace the typographic apostrophe (U+2019) with a plain ASCII apostrophe.
 * Inverse of the apostrophe step in `fixTypography`. Used at export/clipboard
 * boundaries so card names like "Kai'Sa" reach third-party tools as "Kai'Sa".
 *
 * @returns The text with curly apostrophes replaced by straight ones.
 */
export function straightenApostrophes(text: string): string {
  return text.replaceAll("’", "'");
}

/**
 * Sort printings by (languageRank, canonicalRank) — bubbling the user's
 * preferred languages to the top while preserving canonical order within
 * each language bucket. Languages not listed in `languageOrder` sort after
 * listed ones.
 *
 * @returns A new array in (languageRank, canonicalRank) order.
 */
export function sortByLanguageAndCanonicalRank(
  printings: readonly Printing[],
  languageOrder: readonly string[],
): Printing[] {
  const rankByLang = new Map(languageOrder.map((lang, i) => [lang, i]));
  const unlistedRank = languageOrder.length;
  return printings.toSorted((a, b) => {
    const aRank = rankByLang.get(a.language) ?? unlistedRank;
    const bRank = rankByLang.get(b.language) ?? unlistedRank;
    return aRank - bRank || a.canonicalRank - b.canonicalRank;
  });
}

/**
 * Compare two printings with language preference as the primary tiebreaker.
 * Languages earlier in `languageOrder` sort first; unlisted languages sort
 * after listed ones. Falls back to `canonicalRank` — a single-integer key
 * encoding the remaining canonical axes (set, shortCode, marker, finish),
 * computed by the `printings_ordered` DB view.
 *
 * `languageOrder` is required and should be the effective order the caller
 * wants applied — either the user's preference or the DB's
 * `languages.sort_order` (from `/api/enums`) for the default case. There is
 * no hardcoded fallback: admin reorders of the `languages` table must take
 * effect, and that means the caller owns the choice.
 *
 * @returns Negative if a comes first, positive if b comes first, 0 if equal.
 */
export function compareWithLanguagePreference(
  a: Printing,
  b: Printing,
  languageOrder: readonly string[],
): number {
  const aIdx = languageOrder.indexOf(a.language);
  const bIdx = languageOrder.indexOf(b.language);
  const aPos = aIdx === -1 ? languageOrder.length : aIdx;
  const bPos = bIdx === -1 ? languageOrder.length : bIdx;
  const langCompare = aPos - bPos;
  if (langCompare !== 0) {
    return langCompare;
  }
  // Both unlisted — sort alphabetically so the order is deterministic.
  if (aIdx === -1 && bIdx === -1) {
    const alphaCompare = a.language.localeCompare(b.language);
    if (alphaCompare !== 0) {
      return alphaCompare;
    }
  }
  return a.canonicalRank - b.canonicalRank;
}

/**
 * Deduplicate printings to one per card, keeping the best match per
 * {@link compareWithLanguagePreference} (language preference, then canonical rank).
 * @returns Deduplicated printings, one per cardId.
 */
export function deduplicateByCard(
  printings: Printing[],
  languageOrder: readonly string[],
): Printing[] {
  const seen = new Map<string, Printing>();
  for (const printing of printings) {
    const existing = seen.get(printing.cardId);
    if (existing) {
      if (compareWithLanguagePreference(printing, existing, languageOrder) < 0) {
        seen.set(printing.cardId, printing);
      }
    } else {
      seen.set(printing.cardId, printing);
    }
  }
  return [...seen.values()];
}

/**
 * Pick the single best printing for a card from a list of candidates,
 * respecting language preference and canonical ordering.
 * Use this whenever you need "the" printing to display for a card.
 * @returns The preferred printing, or `undefined` if the array is empty.
 */
export function preferredPrinting(
  printings: Printing[],
  languageOrder: readonly string[],
): Printing | undefined {
  if (printings.length === 0) {
    return undefined;
  }
  let best = printings[0];
  for (let i = 1; i < printings.length; i++) {
    if (compareWithLanguagePreference(printings[i], best, languageOrder) < 0) {
      best = printings[i];
    }
  }
  return best;
}

/**
 * Convert a dollar/euro amount to integer cents. Treats 0 as null (no data).
 * @returns The amount in cents, or null if empty/zero.
 */
export function toCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === 0) {
    return null;
  }
  return Math.round(amount * 100);
}

/**
 * Convert a nullable cent value to dollars. Inverse of {@link toCents}.
 * @returns The amount in dollars, or `null` if the input is `null`.
 */
export function centsToDollars<T extends number | null>(cents: T): T extends null ? null : number {
  return (cents === null ? null : cents / 100) as T extends null ? null : number;
}

/**
 * Converts empty strings to `null`, passing through non-empty strings and nullish values as-is.
 *
 * @returns The original string if non-empty, otherwise `null`.
 */
export function emptyToNull(value: string | null | undefined): string | null {
  return value || null;
}

/**
 * Returns the min and max of a number array, snapped to whole numbers (floor min, ceil max). Defaults to 0 when empty.
 *
 * @returns An object with `min` and `max` bounds.
 */
export function boundsOf(vals: number[]): { min: number; max: number } {
  if (vals.length === 0) {
    return { min: 0, max: 0 };
  }
  return {
    min: Math.floor(Math.min(...vals)),
    max: Math.ceil(Math.max(...vals)),
  };
}

export function getOrientation(types: readonly CardType[]): "portrait" | "landscape" {
  return types.includes(WellKnown.cardType.BATTLEFIELD) ? "landscape" : "portrait";
}

/**
 * Extract the card ID prefix from a short code by stripping any trailing
 * lowercase letters or asterisks after the last digit.
 * E.g. "OGN-027a" → "OGN-027", "OGN-027*" → "OGN-027", "OGN-027" → "OGN-027".
 *
 * @returns The short code with its variant/promo suffix removed.
 */
export function extractCardIdFromShortCode(shortCode: string): string {
  return shortCode.replace(/(?<=\d)[a-z*]+$/u, "");
}

/**
 * Return the most frequent string in the array. Ties broken by first occurrence.
 * @returns The most common value, or `""` if the array is empty.
 */
export function mostCommonValue(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let best = items[0];
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Deduplicate short codes as "OGN-027, OGN-027a ×2" entries, preserving input order.
 * @returns An array of formatted entries, or `[]` if the input is empty.
 */
export function formatShortCodesArray(ids: string[]): string[] {
  if (ids.length === 0) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, n]) => (n > 1 ? `${id} ×${n}` : id));
}
