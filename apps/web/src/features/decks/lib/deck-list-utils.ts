import { matchesDomains, noneExcluded } from "@openrift/shared/filters-predicates";
import { foldForSearch, squashForSearch } from "@openrift/shared/search-fold";
import type { DeckListItemResponse } from "@openrift/shared/types/api/deck";
import type { Card } from "@openrift/shared/types/catalog";
import type { Domain } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";

export type DeckListValidity = "all" | "valid" | "invalid";

export type DeckListDrafts = "all" | "hide" | "only";

export type DeckListSortField = "updated" | "created" | "name" | "value";

export type SortDir = "asc" | "desc";

/**
 * `folder` is many-to-one: a deck in several folders renders under each one,
 * so section counts sum past the deck total.
 */
export type DeckListGroupBy = "none" | "format" | "domains" | "legend" | "validity" | "folder";

interface DeckListFilters {
  search: string;
  formats: string[];
  formatsExclude: string[];
  validity: DeckListValidity;
  drafts?: DeckListDrafts;
  domains: Domain[];
  domainsExclude: Domain[];
  folders: string[];
  foldersExclude: string[];
}

export interface DeckGroupLabels {
  domains?: Record<string, string>;
  formats?: Record<string, string>;
  folders?: Record<string, string>;
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

export function deckListEnrichment(
  legendCard: Pick<Card, "name" | "types" | "tags" | "domains"> | undefined,
  championCard: Pick<Card, "name"> | undefined,
): DeckListEnrichment {
  return {
    legendName: legendCard ? legendDisplayName(legendCard) : null,
    championName: championCard?.name ?? null,
    legendDomains: legendCard?.domains ?? null,
  };
}

function deckMatchesSearch(item: DeckListItemWithNames, query: string): boolean {
  if (query === "") {
    return true;
  }
  // Names carry curly apostrophes ("Kai’Sa"), so both sides are folded.
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

function deckMatchesFolders(
  item: DeckListItemWithNames,
  folders: string[],
  excluded: string[],
): boolean {
  if (excluded.length > 0 && item.folderIds.some((id) => excluded.includes(id))) {
    return false;
  }
  if (folders.length === 0) {
    return true;
  }
  return item.folderIds.some((id) => folders.includes(id));
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

function deckMatchesDrafts(item: DeckListItemWithNames, filter: DeckListDrafts = "all"): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "only") {
    return item.deck.isDraft;
  }
  return !item.deck.isDraft;
}

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
      deckMatchesDrafts(item, filters.drafts) &&
      deckMatchesDomains(item, filters.domains, filters.domainsExclude) &&
      deckMatchesFolders(item, filters.folders, filters.foldersExclude),
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
  const source =
    item.legendDomains && item.legendDomains.length > 0
      ? item.legendDomains
      : item.domainDistribution.map((entry) => entry.domain);
  const real = source.filter((domain) => domain !== WellKnown.domain.COLORLESS);
  return [...new Set(real)].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function groupEntriesOf(
  item: DeckListItemWithNames,
  groupBy: DeckListGroupBy,
  labels?: DeckGroupLabels,
): { key: string; label: string }[] {
  switch (groupBy) {
    case "format": {
      const slug = item.deck.format;
      return [{ key: slug, label: labels?.formats?.[slug] ?? slug }];
    }
    case "domains": {
      const combo = domainComboOf(item);
      if (combo.length === 0) {
        return [{ key: "domains:none", label: "No domain" }];
      }
      const label = combo.map((slug) => labels?.domains?.[slug] ?? slug).join(" / ");
      return [{ key: `domains:${label}`, label }];
    }
    case "legend": {
      const legend = item.legendName ?? "(No legend)";
      return [{ key: `legend:${legend}`, label: legend }];
    }
    case "validity": {
      const slug = item.deck.format;
      if (slug === WellKnown.deckFormat.FREEFORM) {
        return [{ key: slug, label: labels?.formats?.[slug] ?? slug }];
      }
      const formatLabel = labels?.formats?.[slug] ?? slug;
      return item.isValid
        ? [{ key: `valid:${slug}`, label: `Valid ${formatLabel}` }]
        : [{ key: `invalid:${slug}`, label: `Invalid ${formatLabel}` }];
    }
    case "folder": {
      if (item.folderIds.length === 0) {
        return [{ key: "folder:none", label: "No folder" }];
      }
      return item.folderIds.map((id) => ({
        key: `folder:${id}`,
        label: labels?.folders?.[id] ?? id,
      }));
    }
    case "none": {
      return [{ key: "all", label: "" }];
    }
  }
}

export function groupDecks(
  items: DeckListItemWithNames[],
  groupBy: DeckListGroupBy,
  dir: SortDir = "asc",
  labels?: DeckGroupLabels,
): DeckListGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", items }];
  }
  const map = new Map<string, DeckListGroup>();
  for (const item of items) {
    for (const { key, label } of groupEntriesOf(item, groupBy, labels)) {
      let group = map.get(key);
      if (!group) {
        group = { key, label, items: [] };
        map.set(key, group);
      }
      group.items.push(item);
    }
  }
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

const GROUPING_OPTIONS = ["format", "domains", "legend", "validity", "folder"] as const;

export interface DeckListFilterAvailability {
  hasMixedFormat: boolean;
  hasMixedValidity: boolean;
  hasArchived: boolean;
  hasDrafts: boolean;
  usefulGroupings: Set<Exclude<DeckListGroupBy, "none">>;
}

export function filterAvailabilityFrom(items: DeckListItemWithNames[]): DeckListFilterAvailability {
  const formats = new Set<string>();
  let sawValid = false;
  let sawInvalid = false;
  let hasArchived = false;
  let hasDrafts = false;
  const groupKeysByOption = {
    format: new Set<string>(),
    domains: new Set<string>(),
    legend: new Set<string>(),
    validity: new Set<string>(),
    folder: new Set<string>(),
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
    if (item.deck.isDraft) {
      hasDrafts = true;
    }
    for (const option of GROUPING_OPTIONS) {
      for (const entry of groupEntriesOf(item, option)) {
        groupKeysByOption[option].add(entry.key);
      }
    }
  }
  const usefulGroupings = new Set<Exclude<DeckListGroupBy, "none">>();
  for (const option of GROUPING_OPTIONS) {
    if (groupKeysByOption[option].size > 1) {
      usefulGroupings.add(option);
    }
  }
  return {
    hasMixedFormat: formats.size > 1,
    hasMixedValidity: sawValid && sawInvalid,
    hasArchived,
    hasDrafts,
    usefulGroupings,
  };
}

export interface DeckListFilterCounts {
  formats: Map<string, number>;
  validity: Map<"valid" | "invalid", number>;
  drafts: Map<"hide" | "only", number>;
  domains: Map<Domain, number>;
  folders: Map<string, number>;
}

export function filterCountsFrom(
  items: DeckListItemWithNames[],
  filters: DeckListFilters,
): DeckListFilterCounts {
  const formats = new Map<string, number>();
  const validity = new Map<"valid" | "invalid", number>();
  const drafts = new Map<"hide" | "only", number>();
  const domains = new Map<Domain, number>();
  const folders = new Map<string, number>();

  for (const item of items) {
    const matchesSearch = deckMatchesSearch(item, filters.search);
    const matchesFormat = deckMatchesFormat(item, filters.formats, filters.formatsExclude);
    const matchesValidity = deckMatchesValidity(item, filters.validity);
    const matchesDraft = deckMatchesDrafts(item, filters.drafts);
    const matchesDomain = deckMatchesDomains(item, filters.domains, filters.domainsExclude);
    const matchesFolder = deckMatchesFolders(item, filters.folders, filters.foldersExclude);

    if (matchesSearch && matchesValidity && matchesDraft && matchesDomain && matchesFolder) {
      formats.set(item.deck.format, (formats.get(item.deck.format) ?? 0) + 1);
    }
    if (matchesSearch && matchesFormat && matchesDraft && matchesDomain && matchesFolder) {
      const bucket = item.isValid ? "valid" : "invalid";
      validity.set(bucket, (validity.get(bucket) ?? 0) + 1);
    }
    if (matchesSearch && matchesFormat && matchesValidity && matchesDomain && matchesFolder) {
      const bucket = item.deck.isDraft ? "only" : "hide";
      drafts.set(bucket, (drafts.get(bucket) ?? 0) + 1);
    }
    // Domains is a union axis: counting it against its own selection would
    // zero out every option the user hasn't picked, so it excludes itself here.
    if (matchesSearch && matchesFormat && matchesValidity && matchesDraft && matchesFolder) {
      for (const domain of domainComboOf(item)) {
        domains.set(domain, (domains.get(domain) ?? 0) + 1);
      }
    }
    // Same reason as domains: folders is a union axis, so it excludes itself here.
    if (matchesSearch && matchesFormat && matchesValidity && matchesDraft && matchesDomain) {
      for (const folderId of item.folderIds) {
        folders.set(folderId, (folders.get(folderId) ?? 0) + 1);
      }
    }
  }

  return { formats, validity, drafts, domains, folders };
}
