import type { DeckListItemResponse, Domain } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type {
  DeckListFormatFilter,
  DeckListGroupBy,
  DeckListSort,
  DeckListValidityFilter,
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

function compareForSort(
  left: DeckListItemWithNames,
  right: DeckListItemWithNames,
  sort: DeckListSort,
): number {
  switch (sort) {
    case "updated-desc": {
      return right.deck.updatedAt.localeCompare(left.deck.updatedAt);
    }
    case "created-desc": {
      return right.deck.createdAt.localeCompare(left.deck.createdAt);
    }
    case "name-asc": {
      return left.deck.name.localeCompare(right.deck.name, undefined, { sensitivity: "base" });
    }
    case "name-desc": {
      return right.deck.name.localeCompare(left.deck.name, undefined, { sensitivity: "base" });
    }
    case "cards-desc": {
      return right.totalCards - left.totalCards;
    }
    case "cards-asc": {
      return left.totalCards - right.totalCards;
    }
    case "value-desc": {
      return (right.totalValueCents ?? -1) - (left.totalValueCents ?? -1);
    }
  }
}

export function sortDecks(
  items: DeckListItemWithNames[],
  sort: DeckListSort,
): DeckListItemWithNames[] {
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
    return compareForSort(left, right, sort);
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
  // Sort groups by label, with "(No legend)" / "No domain" / "Freeform" buckets pushed to the end.
  const groups = [...map.values()];
  groups.sort((left, right) => {
    const leftIsCatchAll = left.key.endsWith(":none") || left.label.startsWith("(");
    const rightIsCatchAll = right.key.endsWith(":none") || right.label.startsWith("(");
    if (leftIsCatchAll && !rightIsCatchAll) {
      return 1;
    }
    if (!leftIsCatchAll && rightIsCatchAll) {
      return -1;
    }
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
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
