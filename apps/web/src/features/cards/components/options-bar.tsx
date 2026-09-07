import type { AvailableFilters, FilterCounts } from "@openrift/shared/filters";
import type { GroupByField, SortOption } from "@openrift/shared/types/search";
import { GROUP_BY_FIELDS } from "@openrift/shared/types/search";
import {
  CopyIcon,
  LayoutGridIcon,
  PanelRightIcon,
  Rows3Icon,
  SquareIcon,
  SquareStackIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ColumnControls } from "@/features/cards/components/column-controls";
import { SortGroupControls } from "@/features/cards/components/sort-group-controls";
import { useFilterActions, useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { isCopiesOnlyGrouping } from "@/features/cards/lib/group-by-collection";
import { groupByOptionsFor, isPrintingsOnlyGrouping } from "@/features/cards/lib/group-by-field";
import { useFilterDrawerStore } from "@/features/cards/stores/filter-drawer-store";
import { useGridViewportStore } from "@/features/cards/stores/grid-viewport-store";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useSmUp } from "@/hooks/use-sm-up";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

import { FilterCustomizeControl } from "./filter-customize-control";
import { FilterPanelContent } from "./filter-panel-content";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "energy", label: "Energy" },
  { value: "rarity", label: "Rarity" },
  { value: "price", label: "Price" },
];

// Excludes "collection" (copies-only); only /collections appends it back.
export const defaultGroupByOptions = groupByOptionsFor(
  GROUP_BY_FIELDS.filter((field) => !isCopiesOnlyGrouping(field)),
);

export const activeToggleClass =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

/**
 * Cards view drops the printings-only axes (card / marker / distribution
 * channel), which collapse every card into one bucket there.
 */
function groupByOptionsForView(view: "cards" | "printings" | "copies") {
  return view === "cards"
    ? defaultGroupByOptions.filter((option) => !isPrintingsOnlyGrouping(option.value))
    : defaultGroupByOptions;
}

/**
 * Docks or undocks the card detail pane. Off by default, in which case a card
 * click opens the detail modal instead. Not rendered on phones, where the
 * detail is always the fullscreen drawer and there is no pane to dock.
 *
 * Exported from {@link DesktopOptionsBar} because it also ends the
 * view-controls cluster on surfaces with a detail pane but no toolbar
 * (the deck overview and the public deck share).
 */
export function DetailPaneToggle({ className }: { className?: string }) {
  const paneDocked = useDisplayStore((state) => state.paneDocked);
  const setPaneDocked = useDisplayStore((state) => state.setPaneDocked);
  const closeDetail = useSelectionStore((state) => state.closeDetail);
  const isMobile = useIsMobile();

  // Undocking must also clear the selection (mirrors SelectionDetailPane's
  // own X); otherwise detailOpen stays set and the hidden card reopens as a modal.
  const handlePressedChange = (next: boolean) => {
    setPaneDocked(next);
    if (!next) {
      closeDetail();
    }
  };

  if (isMobile) {
    return null;
  }
  const label = paneDocked ? "Hide the card detail panel" : "Show the card detail panel";
  return (
    <Toggle
      variant="outline"
      pressed={paneDocked}
      onPressedChange={handlePressedChange}
      className={cn(activeToggleClass, className)}
      title={label}
      aria-label={label}
    >
      <PanelRightIcon className="size-4" />
    </Toggle>
  );
}

function DisplayModeToggle({ compact, className }: { compact?: boolean; className?: string }) {
  const displayMode = useDisplayStore((state) => state.displayMode);
  const setDisplayMode = useDisplayStore((state) => state.setDisplayMode);
  const isMobile = useIsMobile();
  if (isMobile) {
    return null;
  }
  return (
    <ToggleGroup
      aria-label="Display mode"
      className={className}
      variant="outline"
      size={compact ? "sm" : "default"}
      spacing={0}
      value={[displayMode]}
      onValueChange={([next]) => {
        if (next === "grid" || next === "table") {
          setDisplayMode(next);
        }
      }}
    >
      {compact ? (
        <ToggleGroupItem
          value="grid"
          className={cn("gap-1.5 text-xs", activeToggleClass)}
          aria-label="Grid view"
          title="Grid view"
        >
          <LayoutGridIcon />
          Grid
        </ToggleGroupItem>
      ) : (
        <ToggleGroupItem
          value="grid"
          className={activeToggleClass}
          title="Grid view"
          aria-label="Grid view"
        >
          <LayoutGridIcon className="size-4" />
        </ToggleGroupItem>
      )}
      {compact ? (
        <ToggleGroupItem
          value="table"
          className={cn("gap-1.5 text-xs", activeToggleClass)}
          aria-label="Table view"
          title="Table view"
        >
          <Rows3Icon />
          Table
        </ToggleGroupItem>
      ) : (
        <ToggleGroupItem
          value="table"
          className={activeToggleClass}
          title="Table view"
          aria-label="Table view"
        >
          <Rows3Icon className="size-4" />
        </ToggleGroupItem>
      )}
    </ToggleGroup>
  );
}

function ViewModeToggle({
  compact,
  view,
  onViewChange,
  showCopies,
  className,
}: {
  compact?: boolean;
  view: "cards" | "printings" | "copies";
  onViewChange: (v: "cards" | "printings" | "copies") => void;
  showCopies?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label="View mode"
      className={className}
      variant="outline"
      size={compact ? "sm" : "default"}
      spacing={0}
      value={[view]}
      onValueChange={([next]) => {
        if (next === "cards" || next === "printings" || (showCopies && next === "copies")) {
          onViewChange(next);
        }
      }}
    >
      {compact ? (
        <ToggleGroupItem value="cards" className={cn("gap-1.5 text-xs", activeToggleClass)}>
          <SquareIcon />
          Cards
        </ToggleGroupItem>
      ) : (
        <ToggleGroupItem value="cards" className={activeToggleClass} title="One per card">
          <SquareIcon className="size-4" />
        </ToggleGroupItem>
      )}
      {compact ? (
        <ToggleGroupItem value="printings" className={cn("gap-1.5 text-xs", activeToggleClass)}>
          <CopyIcon />
          Printings
        </ToggleGroupItem>
      ) : (
        <ToggleGroupItem value="printings" className={activeToggleClass} title="Every printing">
          <CopyIcon className="size-4" />
        </ToggleGroupItem>
      )}
      {showCopies &&
        (compact ? (
          <ToggleGroupItem value="copies" className={cn("gap-1.5 text-xs", activeToggleClass)}>
            <SquareStackIcon />
            Copies
          </ToggleGroupItem>
        ) : (
          <ToggleGroupItem
            value="copies"
            className={activeToggleClass}
            title="Every individual copy"
          >
            <SquareStackIcon className="size-4" />
          </ToggleGroupItem>
        ))}
    </ToggleGroup>
  );
}

function useOptionsBarState() {
  const { sortBy, sortDir, hasActiveFilters, view, groupBy, groupDir } = useFilterValues();
  const { setSortBy, setSortDir, setView, setGroupBy, setGroupDir } = useFilterActions();

  const displayMode = useDisplayStore((s) => s.displayMode);
  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setMaxColumns = useDisplayStore((s) => s.setMaxColumns);
  const maxColumnsLimit = useGridViewportStore((s) => s.physicalMax);
  const minColumnsLimit = useGridViewportStore((s) => s.physicalMin);
  const autoColumns = useGridViewportStore((s) => s.autoColumns);

  const minColumns = minColumnsLimit;

  const columnProps = {
    maxColumns,
    autoColumns,
    minColumns,
    maxColumnsLimit,
    onMaxColumnsChange: setMaxColumns,
  };

  return {
    sortBy,
    sortDir,
    setSortBy,
    setSortDir,
    hasActiveFilters,
    view,
    setView,
    groupBy,
    groupDir,
    setGroupBy,
    setGroupDir,
    columnProps,
    displayMode,
  };
}

export function DesktopOptionsBar({
  className,
  showCopies,
  hideViewToggle,
  hideDisplayModeToggle,
  groupByOptions,
  groupByValue,
}: {
  className?: string;
  showCopies?: boolean;
  hideViewToggle?: boolean;
  /** Drop the grid/table toggle on a surface that renders no table (the pickers). */
  hideDisplayModeToggle?: boolean;
  /** `value` is `string`: surface-specific keys like "card" aren't in the shared `GroupByField`. */
  groupByOptions?: { value: string; label: string }[];
  groupByValue?: string;
}) {
  const {
    sortBy,
    sortDir,
    setSortBy,
    setSortDir,
    view,
    setView,
    groupBy,
    groupDir,
    setGroupBy,
    setGroupDir,
    columnProps,
    displayMode,
  } = useOptionsBarState();

  const options = groupByOptions ?? groupByOptionsForView(view);

  return (
    <div className={cn("items-center gap-3", className)}>
      <SortGroupControls
        sortOptions={sortOptions}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
        group={{
          options,
          value: groupByValue ?? groupBy,
          dir: groupDir,
          onValueChange: (value) => setGroupBy(value as GroupByField),
          onDirChange: setGroupDir,
        }}
      />
      {!hideViewToggle && (
        <ViewModeToggle view={view} onViewChange={setView} showCopies={showCopies} />
      )}
      {!hideDisplayModeToggle && <DisplayModeToggle />}
      {(hideDisplayModeToggle || displayMode === "grid") && <ColumnControls {...columnProps} />}
    </div>
  );
}

export function MobileOptionsDrawer({
  doneLabel,
  children,
  className,
}: {
  doneLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const openedOnce = useFilterDrawerStore((state) => state.openedOnce);
  const setDrawerOpen = useFilterDrawerStore((state) => state.setOpen);
  const smUp = useSmUp();
  const [idlePremounted, setIdlePremounted] = useState(false);
  useEffect(() => {
    if (smUp || idlePremounted) {
      return;
    }
    // requestIdleCallback is missing on iOS Safari (runtime floor 16.4) —
    // fall back to a delay long enough to stay clear of the load work.
    const premount = () => setIdlePremounted(true);
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(premount, { timeout: 8000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(premount, 3000);
    return () => clearTimeout(timer);
  }, [smUp, idlePremounted]);
  return (
    <Drawer showSwipeHandle onOpenChange={setDrawerOpen}>
      <DrawerTrigger
        render={
          <Button variant="outline" size="icon" className={cn("relative", className)}>
            <SlidersHorizontalIcon className="size-4" />
          </Button>
        }
        aria-label="Options"
      />
      <DrawerContent
        className="pb-4 data-ending-style:duration-250"
        keepMounted={openedOnce || idlePremounted}
      >
        <DrawerHeader className="sr-only">
          <DrawerTitle>Options</DrawerTitle>
          <DrawerDescription>Sort, display, and filter options</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4">
          {children}
        </div>
        <DrawerFooter>
          <DrawerClose render={<Button className="w-full" />}>{doneLabel ?? "Done"}</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function MobileOptionsContent({
  showCopies,
  hideViewToggle,
  hideDisplayModeToggle,
  groupByOptions,
  groupByValue,
}: {
  showCopies?: boolean;
  hideViewToggle?: boolean;
  /** See {@link DesktopOptionsBar}. */
  hideDisplayModeToggle?: boolean;
  /** See {@link DesktopOptionsBar} for why the value type is widened to `string`. */
  groupByOptions?: { value: string; label: string }[];
  /** See {@link DesktopOptionsBar} for the normalized-value override rationale. */
  groupByValue?: string;
} = {}) {
  const {
    sortBy,
    sortDir,
    setSortBy,
    setSortDir,
    view,
    setView,
    groupBy,
    groupDir,
    setGroupBy,
    setGroupDir,
    columnProps,
    displayMode,
  } = useOptionsBarState();

  const options = groupByOptions ?? groupByOptionsForView(view);

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-start gap-2">
        <p className="text-muted-foreground w-18 text-xs font-medium">View</p>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {!hideViewToggle && (
            <ViewModeToggle compact view={view} onViewChange={setView} showCopies={showCopies} />
          )}
          {!hideDisplayModeToggle && <DisplayModeToggle compact />}
          {(hideDisplayModeToggle || displayMode === "grid") && (
            <div className="ml-auto">
              <ColumnControls compact {...columnProps} />
            </div>
          )}
        </div>
      </div>
      <SortGroupControls
        compact
        sortOptions={sortOptions}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
        group={{
          options,
          value: groupByValue ?? groupBy,
          dir: groupDir,
          onValueChange: (value) => setGroupBy(value as GroupByField),
          onDirChange: setGroupDir,
        }}
      />
    </div>
  );
}

export function MobileFilterContent({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  visibleCustomTagCategories,
  filterOverrides,
  filterCounts,
  ownedCountMax,
  topLevelUnits,
}: {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  visibleCustomTagCategories?: ReadonlySet<string>;
  filterOverrides?: Partial<Record<string, string[]>>;
  filterCounts?: FilterCounts;
  ownedCountMax?: number;
  topLevelUnits?: ReadonlySet<string>;
}) {
  return (
    <div className="border-t pt-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-sm font-medium">Filters</p>
        <FilterCustomizeControl />
      </div>
      <div className="flex flex-col gap-4">
        <FilterPanelContent
          availableFilters={availableFilters}
          availableLanguages={availableLanguages}
          setDisplayLabel={setDisplayLabel}
          hiddenSections={hiddenSections}
          visibleCustomTagCategories={visibleCustomTagCategories}
          filterOverrides={filterOverrides}
          filterCounts={filterCounts}
          ownedCountMax={ownedCountMax}
          topLevelUnits={topLevelUnits}
        />
      </div>
    </div>
  );
}
