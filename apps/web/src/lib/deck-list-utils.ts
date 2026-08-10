import type { DeckListItemResponse, Domain } from "@openrift/shared";
import {
  foldForSearch,
  matchesDomains,
  noneExcluded,
  squashForSearch,
  WellKnown,
} from "@openrift/shared";

import type { DeckListValidity } from "@/hooks/use-deck-list-filters";
import type { DeckListGroupBy, DeckListSortField, SortDir } from "@/stores/deck-list-prefs-store";

interface DeckListFilters {
  search: string;
  /** Deck-format slugs, matched as a union. Empty means every format. */
  formats: string[];
  formatsExclude: string[];
  validity: DeckListValidity;
  domains: Domain[];
  domainsExclude: Domain[];
}

interface DeckListEnrichedItem {
  legendName: string | null;
  championName: string | null;
  legendDomains: Domain[] | null;
}

export type DeckListItemWithNames = DeckListItemResponse & DeckListEnrichedItem;

interface DeckListEnrichment {
  legendName: string | null;
  championName: string | null;
  legendDomains: Domain[] | null;
}

export function enrichItem(
  item: DeckListItemResponse,
  enrichment: DeckListEnrichment,
): DeckListItemWithNames {
  return { ...item, ...enrichment };
}

function deckMatchesSearch(item: DeckListItemWithNames, query: string): boolean {
  if (query === "") {
    return true;
  }
  // Legend and champion names carry curly apostrophes ("Kai’Sa"), so both sides
  // are folded. These are all short name-like values, so the squashed form is
  // fair game too and lets "kaisa" match.
  const haystack = [item.deck.name, item.legendName, item.championName]
    .filter((value): value is string => value !== null && value !== undefined)
    .join(" ");
  const folded = foldForSearch(query);
  if (folded === "") {
    return true;
  }
  return (
    foldForSearch(haystack).includes(folded) ||
    squashForSearch(haystack).includes(squashForSearch(query))
  );
}

function deckMatchesFormat(
  item: DeckListItemWithNames,
  formats: string[],
  excluded: string[],
): boolean {
  if (excluded.includes(item.deck.format)) {
    return false;
  }
  if (formats.length === 0) {
    return true;
  }
  return formats.includes(item.deck.format);
}

function deckMatchesValidity(item: DeckListItemWithNames, filter: DeckListValidity): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "valid") {
    return item.isValid;
  }
  return !item.isValid;
}

/**
 * Domain filter, reading exactly as the card browser's does (`matchesDomains`
 * in `@openrift/shared`): one domain picks any deck playing it, several
 * restrict to decks that play nothing outside the set.
 *
 * It measures the deck's *identity* domains, not its raw distribution — the
 * same `domainComboOf` the grouping uses, which prefers the legend and drops
 * Colorless. Nearly every deck runs some Colorless, so a subset test against
 * the distribution would reject almost everything.
 * @returns Whether the deck matches the domain filter.
 */
function deckMatchesDomains(
  item: DeckListItemWithNames,
  required: Domain[],
  excluded: Domain[],
): boolean {
  const identity = domainComboOf(item);
  return matchesDomains(required, identity) && noneExcluded(excluded, identity);
}

export function filterDecks(
  items: DeckListItemWithNames[],
  filters: DeckListFilters,
): DeckListItemWithNames[] {
  const trimmed = filters.search.trim();
  return items.filter(
    (item) =>
      deckMatchesSearch(item, trimmed) &&
      deckMatchesFormat(item, filters.formats, filters.formatsExclude) &&
      deckMatchesValidity(item, filters.validity) &&
      deckMatchesDomains(item, filters.domains, filters.domainsExclude),
  );
}

export function partitionByArchived(
  items: DeckListItemWithNames[],
  showArchived: boolean,
): DeckListItemWithNames[] {
  return showArchived ? items : items.filter((item) => item.deck.archivedAt === null);
}

function compareAscending(
  left: DeckListItemWithNames,
  right: DeckListItemWithNames,
  field: DeckListSortField,
): number {
  switch (field) {
    case "updated": {
      return left.deck.updatedAt.localeCompare(right.deck.updatedAt);
    }
    case "created": {
      return left.deck.createdAt.localeCompare(right.deck.createdAt);
    }
    case "name": {
      return left.deck.name.localeCompare(right.deck.name, undefined, { sensitivity: "base" });
    }
    case "value": {
      return (left.totalValueCents ?? -1) - (right.totalValueCents ?? -1);
    }
  }
}

export function sortDecks(
  items: DeckListItemWithNames[],
  field: DeckListSortField,
  dir: SortDir,
): DeckListItemWithNames[] {
  const directionFactor = dir === "asc" ? 1 : -1;
  return items.toSorted((left, right) => {
    // Pinned floats to the top; archived sinks to the bottom; otherwise apply the chosen sort.
    const leftArchived = left.deck.archivedAt !== null;
    const rightArchived = right.deck.archivedAt !== null;
    if (leftArchived !== rightArchived) {
      return leftArchived ? 1 : -1;
    }
    if (left.deck.isPinned !== right.deck.isPinned) {
      return left.deck.isPinned ? -1 : 1;
    }
    return compareAscending(left, right, field) * directionFactor;
  });
}

interface DeckListGroup {
  key: string;
  label: string;
  items: DeckListItemWithNames[];
}

function domainComboOf(item: DeckListItemWithNames): Domain[] {
  // Prefer the legend's identity (Riftbound's canonical color identity for constructed decks)
  // and fall back to the deck's distribution for legend-less decks. Colorless is excluded
  // since nearly every deck contains at least some Colorless cards and it doesn't define identity.
  const source =
    item.legendDomains && item.legendDomains.length > 0
      ? item.legendDomains
      : item.domainDistribution.map((entry) => entry.domain);
  const real = source.filter((domain) => domain !== WellKnown.domain.COLORLESS);
  return [...new Set(real)].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function groupKeyAndLabel(
  item: DeckListItemWithNames,
  groupBy: DeckListGroupBy,
  domainLabels?: Record<string, string>,
  formatLabels?: Record<string, string>,
): { key: string; label: string } {
  switch (groupBy) {
    case "format": {
      const slug = item.deck.format;
      return { key: slug, label: formatLabels?.[slug] ?? slug };
    }
    case "domains": {
      const combo = domainComboOf(item);
      if (combo.length === 0) {
        return { key: "domains:none", label: "No domain" };
      }
      const label = combo.map((slug) => domainLabels?.[slug] ?? slug).join(" / ");
      return { key: `domains:${label}`, label };
    }
    case "legend": {
      const legend = item.legendName ?? "(No legend)";
      return { key: `legend:${legend}`, label: legend };
    }
    case "validity": {
      const slug = item.deck.format;
      if (slug === WellKnown.deckFormat.FREEFORM) {
        return { key: slug, label: formatLabels?.[slug] ?? slug };
      }
      const formatLabel = formatLabels?.[slug] ?? slug;
      return item.isValid
        ? { key: `valid:${slug}`, label: `Valid ${formatLabel}` }
        : { key: `invalid:${slug}`, label: `Invalid ${formatLabel}` };
    }
    case "none": {
      return { key: "all", label: "" };
    }
  }
}

export function groupDecks(
  items: DeckListItemWithNames[],
  groupBy: DeckListGroupBy,
  dir: SortDir = "asc",
  domainLabels?: Record<string, string>,
  formatLabels?: Record<string, string>,
): DeckListGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", items }];
  }
  const map = new Map<string, DeckListGroup>();
  for (const item of items) {
    const { key, label } = groupKeyAndLabel(item, groupBy, domainLabels, formatLabels);
    let group = map.get(key);
    if (!group) {
      group = { key, label, items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }
  // Sort groups by label. "(No legend)" / "No domain" / "Freeform" catch-all buckets
  // are always pinned to the end regardless of direction — they aren't a real group.
  const groups = [...map.values()];
  const directionFactor = dir === "asc" ? 1 : -1;
  groups.sort((left, right) => {
    const leftIsCatchAll = left.key.endsWith(":none") || left.label.startsWith("(");
    const rightIsCatchAll = right.key.endsWith(":none") || right.label.startsWith("(");
    if (leftIsCatchAll && !rightIsCatchAll) {
      return 1;
    }
    if (!leftIsCatchAll && rightIsCatchAll) {
      return -1;
    }
    return (
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" }) * directionFactor
    );
  });
  return groups;
}

/**
 * The domains the filter can offer: every domain in some deck's identity, on
 * the same `domainComboOf` basis the filter and the grouping measure, so an
 * option can never be one the filter would ignore.
 * @returns A sorted array of every identity domain across the decks.
 */
export function availableDomainsFrom(items: DeckListItemWithNames[]): Domain[] {
  const set = new Set<Domain>();
  for (const item of items) {
    for (const domain of domainComboOf(item)) {
      set.add(domain);
    }
  }
  return [...set].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

/** Summary of which filter and grouping categories are useful given the current deck set. */
export interface DeckListFilterAvailability {
  /** True when the deck set contains both formats — filtering by format adds value. */
  hasMixedFormat: boolean;
  /** True when the deck set contains both valid and invalid decks (only meaningful for constructed). */
  hasMixedValidity: boolean;
  /** True when at least one deck is archived — the show-archived toggle has something to reveal. */
  hasArchived: boolean;
  /** Group-by options that would produce more than one bucket (excludes "none"). */
  usefulGroupings: Set<Exclude<DeckListGroupBy, "none">>;
}

export function filterAvailabilityFrom(items: DeckListItemWithNames[]): DeckListFilterAvailability {
  const formats = new Set<string>();
  let sawValid = false;
  let sawInvalid = false;
  let hasArchived = false;
  const groupKeysByOption = {
    format: new Set<string>(),
    domains: new Set<string>(),
    legend: new Set<string>(),
    validity: new Set<string>(),
  };
  for (const item of items) {
    formats.add(item.deck.format);
    if (item.deck.format !== WellKnown.deckFormat.FREEFORM) {
      if (item.isValid) {
        sawValid = true;
      } else {
        sawInvalid = true;
      }
    }
    if (item.deck.archivedAt !== null) {
      hasArchived = true;
    }
    for (const option of ["format", "domains", "legend", "validity"] as const) {
      groupKeysByOption[option].add(groupKeyAndLabel(item, option).key);
    }
  }
  const usefulGroupings = new Set<Exclude<DeckListGroupBy, "none">>();
  for (const option of ["format", "domains", "legend", "validity"] as const) {
    if (groupKeysByOption[option].size > 1) {
      usefulGroupings.add(option);
    }
  }
  return {
    hasMixedFormat: formats.size > 1,
    hasMixedValidity: sawValid && sawInvalid,
    hasArchived,
    usefulGroupings,
  };
}

/**
 * How many decks each filter option would match, for the counts the filter
 * controls show beside their options — the deck list's answer to the card
 * browser's faceted counts.
 */
export interface DeckListFilterCounts {
  formats: Map<string, number>;
  validity: Map<"valid" | "invalid", number>;
  domains: Map<Domain, number>;
}

/**
 * Counts every filter option in one pass.
 *
 * Each dimension is counted against the decks that pass the *other* filters,
 * so the numbers answer "what would I get if I picked this" rather than "how
 * many exist overall". That is what makes a zero worth showing: the option is
 * live, it just has nothing left under the current selection.
 * @returns Per-option counts for format, validity and domains.
 */
export function filterCountsFrom(
  items: DeckListItemWithNames[],
  filters: DeckListFilters,
): DeckListFilterCounts {
  const formats = new Map<string, number>();
  const validity = new Map<"valid" | "invalid", number>();
  const domains = new Map<Domain, number>();

  for (const item of items) {
    const matchesSearch = deckMatchesSearch(item, filters.search);
    const matchesFormat = deckMatchesFormat(item, filters.formats, filters.formatsExclude);
    const matchesValidity = deckMatchesValidity(item, filters.validity);
    const matchesDomain = deckMatchesDomains(item, filters.domains, filters.domainsExclude);

    if (matchesSearch && matchesValidity && matchesDomain) {
      formats.set(item.deck.format, (formats.get(item.deck.format) ?? 0) + 1);
    }
    if (matchesSearch && matchesFormat && matchesDomain) {
      const bucket = item.isValid ? "valid" : "invalid";
      validity.set(bucket, (validity.get(bucket) ?? 0) + 1);
    }
    // Domains count against the other dimensions only, like format and
    // legality do — the axis reads as a union at one pick, so counting it
    // against itself would zero out every option the user hasn't chosen. Same
    // identity basis the filter uses, and a deck counts once per identity
    // domain, so the column sums past the deck count.
    if (matchesSearch && matchesFormat && matchesValidity) {
      for (const domain of domainComboOf(item)) {
        domains.set(domain, (domains.get(domain) ?? 0) + 1);
      }
    }
  }

  return { formats, validity, domains };
}
