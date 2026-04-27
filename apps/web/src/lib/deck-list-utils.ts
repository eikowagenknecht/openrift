import type { DeckListItemResponse, Domain } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type {
  DeckListFormatFilter,
  DeckListGroupBy,
  DeckListSortField,
  DeckListValidityFilter,
  SortDir,
} from "@/stores/deck-list-prefs-store";

export interface DeckListFilters {
  search: string;
  format: DeckListFormatFilter;
  validity: DeckListValidityFilter;
  domains: Domain[];
}

interface DeckListEnrichedItem {
  legendName: string | null;
  championName: string | null;
  legendDomains: Domain[] | null;
}

export type DeckListItemWithNames = DeckListItemResponse & DeckListEnrichedItem;

export interface DeckListEnrichment {
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
  const haystack = [item.deck.name, item.legendName, item.championName]
    .filter((value): value is string => value !== null && value !== undefined)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function deckMatchesFormat(item: DeckListItemWithNames, filter: DeckListFormatFilter): boolean {
  if (filter === "all") {
    return true;
  }
  return item.deck.format === filter;
}

function deckMatchesValidity(item: DeckListItemWithNames, filter: DeckListValidityFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "valid") {
    return item.isValid;
  }
  return !item.isValid;
}

function deckMatchesDomains(item: DeckListItemWithNames, required: Domain[]): boolean {
  if (required.length === 0) {
    return true;
  }
  const present = new Set(item.domainDistribution.map((entry) => entry.domain));
  return required.every((domain) => present.has(domain));
}

export function filterDecks(
  items: DeckListItemWithNames[],
  filters: DeckListFilters,
): DeckListItemWithNames[] {
  const trimmed = filters.search.trim();
  return items.filter(
    (item) =>
      deckMatchesSearch(item, trimmed) &&
      deckMatchesFormat(item, filters.format) &&
      deckMatchesValidity(item, filters.validity) &&
      deckMatchesDomains(item, filters.domains),
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

export interface DeckListGroup {
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
): { key: string; label: string } {
  switch (groupBy) {
    case "format": {
      return item.deck.format === "constructed"
        ? { key: "constructed", label: "Constructed" }
        : { key: "freeform", label: "Freeform" };
    }
    case "domains": {
      const combo = domainComboOf(item);
      if (combo.length === 0) {
        return { key: "domains:none", label: "No domain" };
      }
      const label = combo.join(" / ");
      return { key: `domains:${label}`, label };
    }
    case "legend": {
      const legend = item.legendName ?? "(No legend)";
      return { key: `legend:${legend}`, label: legend };
    }
    case "validity": {
      if (item.deck.format === "freeform") {
        return { key: "freeform", label: "Freeform" };
      }
      return item.isValid
        ? { key: "valid", label: "Valid constructed" }
        : { key: "invalid", label: "Invalid constructed" };
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
): DeckListGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", items }];
  }
  const map = new Map<string, DeckListGroup>();
  for (const item of items) {
    const { key, label } = groupKeyAndLabel(item, groupBy);
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
 * Returns the union of domains observed across all decks (for the filter chip set).
 * @returns A sorted array of every domain that appears in at least one deck's distribution.
 */
export function availableDomainsFrom(items: DeckListItemResponse[]): Domain[] {
  const set = new Set<Domain>();
  for (const item of items) {
    for (const entry of item.domainDistribution) {
      set.add(entry.domain);
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
    if (item.deck.format === "constructed") {
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
