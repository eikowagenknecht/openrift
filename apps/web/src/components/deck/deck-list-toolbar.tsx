import type { Domain } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { LayoutGridIcon, ListIcon, SearchIcon, XIcon } from "lucide-react";

import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckFormatList } from "@/hooks/use-enums";
import type { DeckListFilterAvailability } from "@/lib/deck-list-utils";
import { cn } from "@/lib/utils";
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
  const setDomainFilter = useDeckListPrefsStore((state) => state.setDomainFilter);
  const showArchived = useDeckListPrefsStore((state) => state.showArchived);
  const setShowArchived = useDeckListPrefsStore((state) => state.setShowArchived);
  const resetFilters = useDeckListPrefsStore((state) => state.resetFilters);
  const { formats } = useDeckFormatList();
  const formatSlugs = new Set(formats.map((entry) => entry.slug));

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
          sortBy={sortField}
          sortDir={sortDir}
          onSortByChange={setSortField}
          onSortDirChange={setSortDir}
          group={{
            options: visibleGroupOptions,
            value: groupBy,
            dir: groupDir,
            onValueChange: setGroupBy,
            onDirChange: setGroupDir,
          }}
        />

        <ToggleGroup
          className="ml-auto"
          variant="outline"
          size="sm"
          value={[density]}
          onValueChange={([next]) => {
            if (next === "grid" || next === "list") {
              setDensity(next);
            }
          }}
          aria-label="Density"
        >
          <Tooltip>
            <TooltipTrigger render={<ToggleGroupItem value="grid" aria-label="Grid view" />}>
              <LayoutGridIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Grid view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<ToggleGroupItem value="list" aria-label="List view" />}>
              <ListIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>List view</TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>

      {/* Row 2: filter chips (only render when there's at least one useful filter) */}
      {showFilterRow && (
        <div className="flex flex-wrap items-center gap-2">
          {availability.hasMixedFormat && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">Format:</span>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[formatFilter]}
                onValueChange={([next]) => {
                  if (next === "all" || formatSlugs.has(next)) {
                    setFormatFilter(next);
                  }
                }}
                aria-label="Format filter"
              >
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                {formats.map((entry) => (
                  <ToggleGroupItem key={entry.slug} value={entry.slug}>
                    {entry.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {availability.hasMixedValidity && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">Validity:</span>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[validityFilter]}
                onValueChange={([next]) => {
                  if (next === "all" || next === "valid" || next === "invalid") {
                    setValidityFilter(next);
                  }
                }}
                aria-label="Validity filter"
              >
                {(["all", "valid", "invalid"] as const).map((value) => (
                  <ToggleGroupItem key={value} value={value} className="capitalize">
                    {value}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {availableDomains.length > 1 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">Domains:</span>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                value={domainFilter}
                onValueChange={(next) => setDomainFilter(next as Domain[])}
                aria-label="Domain filter"
              >
                {availableDomains.map((domain) => {
                  const lower = domain.toLowerCase();
                  const isColorless = domain === WellKnown.domain.COLORLESS;
                  const ext = isColorless ? "svg" : "webp";
                  return (
                    <Tooltip key={domain}>
                      <TooltipTrigger
                        render={
                          <ToggleGroupItem value={domain} aria-label={`Filter by ${domain}`} />
                        }
                      >
                        <img
                          src={`/images/domains/${lower}.${ext}`}
                          alt=""
                          className={cn("size-4", isColorless && "brightness-0 dark:invert")}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{domain}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </ToggleGroup>
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
