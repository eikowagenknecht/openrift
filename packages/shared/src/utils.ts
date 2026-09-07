import type { Card, CardType, Printing } from "./types/index.js";
import { WellKnown } from "./well-known.js";

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

export interface CardNameParts {
  name: string;
  types: readonly CardType[];
  tags: readonly string[];
}

export function legendDisplayName(card: CardNameParts): string {
  if (!card.types.includes(WellKnown.cardType.LEGEND) || card.tags.length === 0) {
    return card.name;
  }
  const tag = card.tags[0];
  // Already-prefixed names ("Sett, Kingpin") pass through so composing twice can't double up.
  if (card.name.startsWith(`${tag}, `)) {
    return card.name;
  }
  return `${tag}, ${legendEpithet(card.name)}`;
}

function legendEpithet(name: string): string {
  const comma = name.indexOf(", ");
  return comma === -1 ? name : name.slice(0, comma);
}

// Always append cardSlug, even for a champion with only one legend: a later
// second variant would otherwise break the existing /meta/legends/<slug> link.
export function metaLegendSlug(displayName: string, cardSlug: string): string {
  const comma = displayName.indexOf(", ");
  if (comma === -1) {
    return cardSlug;
  }
  return `${slugifyName(displayName.slice(0, comma))}-${cardSlug}`;
}

// The `#n` suffix on a playloltcg identity only disambiguates two same-named
// entrants of one event, so it's folded away for the player's page.
export function metaPlayerKey(sourceIdentity: string | null): string | null {
  if (sourceIdentity === null || sourceIdentity === "") {
    return null;
  }
  return sourceIdentity.replace(/#\d+$/u, "");
}

export function compareCardDisplayName(left: CardNameParts, right: CardNameParts): number {
  return legendDisplayName(left).localeCompare(legendDisplayName(right));
}

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

export function deckIdentityLabels(
  legend?: Pick<Card, "name" | "types" | "tags">,
  champion?: Pick<Card, "name">,
): { character?: string; legend?: string; champion?: string } {
  const legendLabel = legend ? legendDisplayName(legend) : undefined;
  const character =
    legend !== undefined && legend.types.includes(WellKnown.cardType.LEGEND)
      ? legend.tags[0]
      : undefined;
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

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

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

// PostgreSQL's [[:alnum:]] keeps \p{Nd}+\p{Nl} but drops other-numeric chars
// (½, ①); this regex must match it character for character.
const NAME_MATCH_KEEP = /[^\p{L}\p{Nd}\p{Nl}]/gu;

// Must match the SQL mirror (cards_set_norm_name()) character for character;
// changing this needs a migration and backfill.
export function normalizeNameForIdentity(name: string): string {
  return name.toLowerCase().replaceAll(NAME_MATCH_KEEP, "");
}

export function straightenApostrophes(text: string): string {
  return text.replaceAll("’", "'");
}

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

// languageOrder must be the caller's effective order (user preference, or
// languages.sort_order); this function has no hardcoded fallback.
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
  if (aIdx === -1 && bIdx === -1) {
    const alphaCompare = a.language.localeCompare(b.language);
    if (alphaCompare !== 0) {
      return alphaCompare;
    }
  }
  return a.canonicalRank - b.canonicalRank;
}

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

// 0 is treated as no data and returned as null, not 0 cents.
export function toCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === 0) {
    return null;
  }
  return Math.round(amount * 100);
}

export function centsToDollars<T extends number | null>(cents: T): T extends null ? null : number {
  return (cents === null ? null : cents / 100) as T extends null ? null : number;
}

export function emptyToNull(value: string | null | undefined): string | null {
  return value || null;
}

export function trimToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

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

export function extractCardIdFromShortCode(shortCode: string): string {
  return shortCode.replace(/(?<=\d)[a-z*]+$/u, "");
}

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

export function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

// Reference-table slugs use `-`; a few legacy ones use `_`.
const SLUG_SEPARATORS = /[-_]/u;

export function sentenceCaseSlug(slug: string): string {
  return capitalize(slug.split(SLUG_SEPARATORS).filter(Boolean).join(" "));
}

export function titleCaseSlug(slug: string): string {
  return slug
    .split(SLUG_SEPARATORS)
    .filter(Boolean)
    .map((word) => capitalize(word))
    .join(" ");
}

// The ellipsis itself counts toward `max`.
export function truncateWithEllipsis(text: string, max: number): string {
  if (max <= 0) {
    return "";
  }
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function labelMap(rows: readonly { slug: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.slug, row.label]));
}

// Locale fixed to `en`: server-rendered and browser-rendered output must match.
export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(cents / 100);
}

export function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  return JSON.stringify(value) ?? "";
}
