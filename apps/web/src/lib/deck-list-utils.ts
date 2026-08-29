import type { Card, DeckListItemResponse, Domain } from "@openrift/shared";
import {
  foldForSearch,
  legendDisplayName,
  matchesDomains,
  noneExcluded,
  squashForSearch,
  WellKnown,
} from "@openrift/shared";

import type { DeckListDrafts, DeckListValidity } from "@/hooks/use-deck-list-filters";
import type { DeckListGroupBy, DeckListSortField, SortDir } from "@/stores/deck-list-prefs-store";

interface DeckListFilters {
  search: string;
  /** Deck-format slugs, matched as a union. Empty means every format. */
  formats: string[];
  formatsExclude: string[];
  validity: DeckListValidity;
  /** Draft variants (ADR-042). Optional so older call sites keep compiling as "all". */
  drafts?: DeckListDrafts;
  domains: Domain[];
  domainsExclude: Domain[];
  /** Folder ids, matched as a union. Empty means every folder. */
  folders: string[];
  foldersExclude: string[];
}

/**
 * Display names for the grouping axes that key on ids or slugs. Every field is
 * optional: a missing lookup falls back to the raw key, which is what
 * `filterAvailabilityFrom` relies on when it only needs bucket identity.
 */
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

/**
 * The names and domains a deck row carries beyond its API shape, resolved from
 * the catalog. The legend goes through `legendDisplayName` here rather than at
 * each reader, so the group header, the search haystack and the tile all name a
 * Legend by its champion.
 *
 * @returns The enrichment for {@link enrichItem}.
 */
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

/**
 * Folder filter. A deck carries several folders, so include is a union ("in any
 * of these") rather than a subset test, matching how the format axis reads.
 * Exclude is evaluated first and wins, as everywhere else.
 * @returns Whether the deck matches the folder filter.
 */
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

/**
 * The buckets a deck belongs to on the given axis.
 *
 * Every axis but `folder` yields exactly one bucket. `folder` yields one per
 * folder the deck is filed in — a deck in two folders is rendered under both,
 * which is the point of many-to-many membership — or the catch-all bucket when
 * it is filed nowhere.
 * @returns One entry per bucket the deck belongs to, never empty.
 */
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
    // Folder grouping returns several entries for one deck, so this is a nested
    // loop rather than a single push — the deck lands in every bucket it's in.
    for (const { key, label } of groupEntriesOf(item, groupBy, labels)) {
      let group = map.get(key);
      if (!group) {
        group = { key, label, items: [] };
        map.set(key, group);
      }
      group.items.push(item);
    }
  }
  // Sort groups by label. "(No legend)" / "No domain" / "No folder" / "Freeform"
  // catch-all buckets are always pinned to the end regardless of direction —
  // they aren't a real group.
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

/** Every grouping axis except `none`, which is not a bucket. */
const GROUPING_OPTIONS = ["format", "domains", "legend", "validity", "folder"] as const;

/** Summary of which filter and grouping categories are useful given the current deck set. */
export interface DeckListFilterAvailability {
  /** True when the deck set contains both formats — filtering by format adds value. */
  hasMixedFormat: boolean;
  /** True when the deck set contains both valid and invalid decks (only meaningful for constructed). */
  hasMixedValidity: boolean;
  /** True when at least one deck is archived — the show-archived toggle has something to reveal. */
  hasArchived: boolean;
  /** True when at least one deck is a draft variant — the draft filter has something to isolate. */
  hasDrafts: boolean;
  /** Group-by options that would produce more than one bucket (excludes "none"). */
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

/**
 * How many decks each filter option would match, for the counts the filter
 * controls show beside their options — the deck list's answer to the card
 * browser's faceted counts.
 */
export interface DeckListFilterCounts {
  formats: Map<string, number>;
  validity: Map<"valid" | "invalid", number>;
  /** Keyed by the choice itself: how many decks each draft setting would leave. */
  drafts: Map<"hide" | "only", number>;
  domains: Map<Domain, number>;
  /** Keyed by folder id. A deck counts once per folder, so this sums past the deck count. */
  folders: Map<string, number>;
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
    // Domains count against the other dimensions only, like format and
    // legality do — the axis reads as a union at one pick, so counting it
    // against itself would zero out every option the user hasn't chosen. Same
    // identity basis the filter uses, and a deck counts once per identity
    // domain, so the column sums past the deck count.
    if (matchesSearch && matchesFormat && matchesValidity && matchesDraft && matchesFolder) {
      for (const domain of domainComboOf(item)) {
        domains.set(domain, (domains.get(domain) ?? 0) + 1);
      }
    }
    // Folders count against the other dimensions only, for the same reason
    // domains do: the axis is a union, so counting it against itself would zero
    // out every unpicked option. A deck in several folders counts in each.
    if (matchesSearch && matchesFormat && matchesValidity && matchesDraft && matchesDomain) {
      for (const folderId of item.folderIds) {
        folders.set(folderId, (folders.get(folderId) ?? 0) + 1);
      }
    }
  }

  return { formats, validity, drafts, domains, folders };
}
