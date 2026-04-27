import type { Domain } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { LayoutGridIcon, ListIcon, SearchIcon, XIcon } from "lucide-react";

import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckListFilterAvailability } from "@/lib/deck-list-utils";
import type { DeckListGroupBy, DeckListSortField } from "@/stores/deck-list-prefs-store";
import { useDeckListPrefsStore } from "@/stores/deck-list-prefs-store";

const SORT_OPTIONS: SortGroupOption<DeckListSortField>[] = [
  { value: "updated", label: "Updated" },
  { value: "created", label: "Created" },
  { value: "name", label: "Name" },
  { value: "value", label: "Value" },
];

const GROUP_OPTIONS: SortGroupOption<DeckListGroupBy>[] = [
  { value: "none", label: "None" },
  { value: "format", label: "Format" },
  { value: "domains", label: "Domains" },
  { value: "legend", label: "Legend" },
  { value: "validity", label: "Validity" },
];

function DomainChip({
  domain,
  active,
  onToggle,
}: {
  domain: Domain;
  active: boolean;
  onToggle: () => void;
}) {
  const lower = domain.toLowerCase();
  const ext = domain === WellKnown.domain.COLORLESS ? "svg" : "webp";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={active ? "default" : "outline"}
            size="icon-sm"
            aria-pressed={active}
            aria-label={`Filter by ${domain}`}
            onClick={onToggle}
          />
        }
      >
        <img src={`/images/domains/${lower}.${ext}`} alt="" className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{domain}</TooltipContent>
    </Tooltip>
  );
}

export function DeckListToolbar({
  availableDomains,
  availability,
  totalCount,
  filteredCount,
}: {
  availableDomains: Domain[];
  availability: DeckListFilterAvailability;
  totalCount: number;
  filteredCount: number;
}) {
  const search = useDeckListPrefsStore((state) => state.search);
  const setSearch = useDeckListPrefsStore((state) => state.setSearch);
  const sortField = useDeckListPrefsStore((state) => state.sortField);
  const setSortField = useDeckListPrefsStore((state) => state.setSortField);
  const sortDir = useDeckListPrefsStore((state) => state.sortDir);
  const setSortDir = useDeckListPrefsStore((state) => state.setSortDir);
  const density = useDeckListPrefsStore((state) => state.density);
  const setDensity = useDeckListPrefsStore((state) => state.setDensity);
  const groupBy = useDeckListPrefsStore((state) => state.groupBy);
  const setGroupBy = useDeckListPrefsStore((state) => state.setGroupBy);
  const groupDir = useDeckListPrefsStore((state) => state.groupDir);
  const setGroupDir = useDeckListPrefsStore((state) => state.setGroupDir);
  const formatFilter = useDeckListPrefsStore((state) => state.formatFilter);
  const setFormatFilter = useDeckListPrefsStore((state) => state.setFormatFilter);
  const validityFilter = useDeckListPrefsStore((state) => state.validityFilter);
  const setValidityFilter = useDeckListPrefsStore((state) => state.setValidityFilter);
  const domainFilter = useDeckListPrefsStore((state) => state.domainFilter);
  const toggleDomainFilter = useDeckListPrefsStore((state) => state.toggleDomainFilter);
  const showArchived = useDeckListPrefsStore((state) => state.showArchived);
  const setShowArchived = useDeckListPrefsStore((state) => state.setShowArchived);
  const resetFilters = useDeckListPrefsStore((state) => state.resetFilters);

  const hasActiveFilter =
    search !== "" || formatFilter !== "all" || validityFilter !== "all" || domainFilter.length > 0;

  // Hide group options that would yield a single bucket; keep "none" and the current selection
  // so the trigger always reflects state even if that grouping is no longer useful.
  const visibleGroupOptions = GROUP_OPTIONS.filter(
    (option) =>
      option.value === "none" ||
      option.value === groupBy ||
      availability.usefulGroupings.has(option.value),
  );

  const showFilterRow =
    availability.hasMixedFormat ||
    availability.hasMixedValidity ||
    availableDomains.length > 1 ||
    availability.hasArchived ||
    hasActiveFilter;

  const countLabel =
    hasActiveFilter && filteredCount !== totalCount
      ? `${filteredCount} / ${totalCount}`
      : String(totalCount);
  const unitLabel = totalCount === 1 ? "deck" : "decks";

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: search + sort/group + density */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search decks..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={search ? "pr-28 pl-9" : "pr-20 pl-9"}
            aria-label="Search decks"
          />
          <span className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
            <span className="text-muted-foreground pointer-events-none text-xs">
              {countLabel} {unitLabel}
            </span>
            {search && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </span>
        </div>

        <SortGroupControls
          sortOptions={SORT_OPTIONS}
          groupOptions={visibleGroupOptions}
          sortBy={sortField}
          sortDir={sortDir}
          groupBy={groupBy}
          groupDir={groupDir}
          onSortByChange={setSortField}
          onSortDirChange={setSortDir}
          onGroupByChange={setGroupBy}
          onGroupDirChange={setGroupDir}
        />

        <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={density === "grid" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="Grid view"
                  aria-pressed={density === "grid"}
                  onClick={() => setDensity("grid")}
                />
              }
            >
              <LayoutGridIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Grid view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={density === "list" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="List view"
                  aria-pressed={density === "list"}
                  onClick={() => setDensity("list")}
                />
              }
            >
              <ListIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>List view</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Row 2: filter chips (only render when there's at least one useful filter) */}
      {showFilterRow && (
        <div className="flex flex-wrap items-center gap-2">
          {availability.hasMixedFormat && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">Format:</span>
              {(["all", "constructed", "freeform"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={formatFilter === value ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-xs capitalize"
                  aria-pressed={formatFilter === value}
                  onClick={() => setFormatFilter(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          )}

          {availability.hasMixedValidity && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">Validity:</span>
              {(["all", "valid", "invalid"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={validityFilter === value ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-xs capitalize"
                  aria-pressed={validityFilter === value}
                  onClick={() => setValidityFilter(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          )}

          {availableDomains.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">Domains:</span>
              {availableDomains.map((domain) => (
                <DomainChip
                  key={domain}
                  domain={domain}
                  active={domainFilter.includes(domain)}
                  onToggle={() => toggleDomainFilter(domain)}
                />
              ))}
            </div>
          )}

          {availability.hasArchived && (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={showArchived ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                aria-pressed={showArchived}
                onClick={() => setShowArchived(!showArchived)}
              >
                {showArchived ? "Hide archived" : "Show archived"}
              </Button>
            </div>
          )}

          {hasActiveFilter && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={resetFilters}
            >
              Reset filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
