import type { DeckFolderResponse } from "@openrift/shared/types/api/deck";
import type { Domain } from "@openrift/shared/types/enums";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import type { ReactNode } from "react";

import { MobileOptionsDrawer } from "@/components/filters/options-bar";
import { SearchInput } from "@/components/filters/search-input";
import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckListFilters } from "@/hooks/use-deck-list-filters";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import type {
  DeckListFilterAvailability,
  DeckListFilterCounts,
  DeckListGroupBy,
  DeckListSortField,
} from "@/lib/deck-list-utils";
import { useDeckListPrefsStore, useDeckListViewPrefs } from "@/stores/deck-list-prefs-store";

import { DeckActiveFilters } from "./deck-active-filters";
import { DeckFilterControls, hasUsableDeckFilters } from "./deck-filter-controls";

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
  { value: "folder", label: "Folder" },
];

function DensityToggle({ className }: { className?: string }) {
  const density = useDeckListPrefsStore((state) => state.density);
  const setDensity = useDeckListPrefsStore((state) => state.setDensity);
  return (
    // Default size, not sm: everything else in this row is h-8.
    <ToggleGroup
      className={className}
      variant="outline"
      spacing={0}
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
  );
}

function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

export function DeckListToolbar({
  availableDomains,
  availability,
  counts,
  folders,
  totalCount,
  filteredCount,
}: {
  availableDomains: Domain[];
  availability: DeckListFilterAvailability;
  counts: DeckListFilterCounts;
  folders: DeckFolderResponse[];
  totalCount: number;
  filteredCount: number;
}) {
  const { search, setSearch, hasActiveFilters } = useDeckListFilters();
  const {
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    groupBy,
    setGroupBy,
    groupDir,
    setGroupDir,
  } = useDeckListViewPrefs();

  const [localSearch, setLocalSearch] = useSearchUrlSync({
    urlValue: search,
    onCommit: setSearch,
  });

  const visibleGroupOptions = GROUP_OPTIONS.filter((option) => {
    if (option.value === "folder" && folders.length === 0) {
      return false;
    }
    return (
      option.value === "none" ||
      option.value === groupBy ||
      availability.usefulGroupings.has(option.value)
    );
  });

  const sortGroupControls = (
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
  );

  const countLabel =
    hasActiveFilters && filteredCount !== totalCount
      ? `${filteredCount} / ${totalCount}`
      : String(totalCount);
  const unitLabel = totalCount === 1 ? "deck" : "decks";
  // Keeps the row alive even when the deck set has made every control
  // pointless, so there is always a way back to the full list.
  const showFilters =
    hasUsableDeckFilters(availability, availableDomains, folders) || hasActiveFilters;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={localSearch}
          onValueChange={setLocalSearch}
          placeholder="Search decks..."
          ariaLabel="Search decks"
          trailing={`${countLabel} ${unitLabel}`}
          className="min-w-[200px] flex-1"
        />

        {/* Below md the controls live in the drawer; the bar keeps only the search box and triggers. */}
        <div className="hidden items-center gap-3 md:flex">
          {sortGroupControls}
          <DensityToggle className="ml-auto" />
        </div>

        <div className="ml-auto flex items-center gap-2 md:hidden">
          <DensityToggle />
          <MobileOptionsDrawer doneLabel={hasActiveFilters ? "Show decks" : undefined}>
            <DrawerSection label="Sort & group">{sortGroupControls}</DrawerSection>
            {showFilters && (
              <DrawerSection label="Filter">
                <DeckFilterControls
                  availableDomains={availableDomains}
                  availability={availability}
                  counts={counts}
                  folders={folders}
                  triggerStyle="chip"
                  stacked
                />
              </DrawerSection>
            )}
          </MobileOptionsDrawer>
        </div>
      </div>

      {/* Below md the chips are the only readout; elsewhere the controls show their own selections. */}
      {hasActiveFilters && (
        <div className="md:hidden">
          <DeckActiveFilters />
        </div>
      )}

      {showFilters && (
        <div className="hidden md:block">
          <DeckFilterControls
            availableDomains={availableDomains}
            availability={availability}
            counts={counts}
            folders={folders}
          />
        </div>
      )}
    </div>
  );
}
