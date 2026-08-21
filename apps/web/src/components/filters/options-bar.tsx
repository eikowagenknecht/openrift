import type { AvailableFilters, FilterCounts, GroupByField, SortOption } from "@openrift/shared";
import { GROUP_BY_FIELDS } from "@openrift/shared";
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

import { ColumnControls } from "@/components/filters/column-controls";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
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
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useSmUp } from "@/hooks/use-sm-up";
import { isCopiesOnlyGrouping } from "@/lib/group-by-collection";
import { groupByOptionsFor, isPrintingsOnlyGrouping } from "@/lib/group-by-field";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useFilterDrawerStore } from "@/stores/filter-drawer-store";
import { useGridViewportStore } from "@/stores/grid-viewport-store";
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

// Every shared axis in GROUP_BY_FIELDS order, minus "collection": that one is
// copies-only, so the single surface offering it (/collections) appends it
// rather than every other surface having to filter it back out.
// Exported so those surfaces extend this list instead of restating the labels.
export const defaultGroupByOptions = groupByOptionsFor(
  GROUP_BY_FIELDS.filter((field) => !isCopiesOnlyGrouping(field)),
);

// Persistent primary fill for the active toggle option, overriding the base
// toggle's muted active state (including on hover) to match the prior
// variant="default" Button look. Exported so surfaces with their own toggles
// outside this bar (the deck overview's view controls) read the same when on.
export const activeToggleClass =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

/**
 * The default group-by options available in the given view. Cards view drops
 * the printings-only axes (card / marker / distribution channel), which collapse
 * every card into one bucket there — or, for card, into a section apiece (see
 * isPrintingsOnlyGrouping).
 * @returns The group-by options for `view`.
 */
function groupByOptionsForView(view: "cards" | "printings" | "copies") {
  return view === "cards"
    ? defaultGroupByOptions.filter((option) => !isPrintingsOnlyGrouping(option.value))
    : defaultGroupByOptions;
}

/**
 * Docks or undocks the card detail pane. Off by default, in which case a card
 * click opens the detail modal instead — clicking then never reflows the grid
 * under the pointer. Not rendered on phones, where the detail is always the
 * fullscreen drawer and there is no pane to dock.
 *
 * Exported rather than placed inside {@link DesktopOptionsBar} because it sits
 * at the far right of whatever row hosts it, after any surface-specific extras:
 * `BrowserToolbar` renders it last, and the two surfaces with a detail pane but
 * no toolbar at all (the deck overview and the public deck share, both via
 * `DeckOverview`) end their own view-controls cluster with it.
 * @returns The pane toggle, or null on mobile.
 */
export function DetailPaneToggle({ className }: { className?: string }) {
  const paneDocked = useDisplayStore((state) => state.paneDocked);
  const setPaneDocked = useDisplayStore((state) => state.setPaneDocked);
  const closeDetail = useSelectionStore((state) => state.closeDetail);
  const isMobile = useIsMobile();

  // Undocking clears the selection too, mirroring the pane's own X
  // (SelectionDetailPane.handleClose). Flipping paneDocked alone leaves
  // detailOpen set, which is exactly what the modal opens on, so the card the
  // user just hid would reappear in a dialog.
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

/* ------------------------------------------------------------------ */
/*  Shared hook                                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  DesktopOptionsBar — visible sm and up                              */
/* ------------------------------------------------------------------ */

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
  /**
   * Override the default group-by options (e.g. /promos uses
   * channel/card/year/marker). `value` is widened to `string` because
   * surface-specific keys like "card" aren't in the shared `GroupByField` —
   * the URL is loosely typed and each surface re-parses on read.
   */
  groupByOptions?: { value: string; label: string }[];
  /**
   * Override the displayed group-by value. Surfaces with their own valid
   * group-by set (e.g. /promos, where the URL default "set" isn't a valid
   * promo grouping) pass the normalized value so the dropdown shows a real
   * option instead of the raw URL string. Falls back to `filterState.groupBy`
   * when not provided.
   */
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

  // Surfaces that pass their own options (e.g. /promos) keep them; otherwise the
  // defaults are narrowed to what makes sense in the current view.
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
      {/* A surface with no table is always a grid, whatever the shared display
          preference says, so its column controls stay up. */}
      {(hideDisplayModeToggle || displayMode === "grid") && <ColumnControls {...columnProps} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MobileOptionsDrawer — generic drawer shell                         */
/* ------------------------------------------------------------------ */

export function MobileOptionsDrawer({
  doneLabel,
  children,
  className,
}: {
  doneLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  // Published so data hooks can skip computing the faceted filter counts while
  // no chip surface is visible (on phones that's whenever the drawer is
  // closed). keepMounted keeps the filter panel mounted across open/close so
  // an open just replays the slide-in instead of paying the full panel mount
  // (~300ms on a mid-range phone). The idle pre-mount extends that to the
  // FIRST open: shortly after load, once the main thread is idle, the panel
  // mounts hidden. Desktop (sm and up) never opens this drawer, so it never
  // pre-mounts there.
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
      {/* data-ending-style:duration-250: the grid behind is already updated
          when "Show N cards" is tapped, so a quicker exit reads as snappier —
          the 450ms default made the dismiss the slowest part of filtering. */}
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

/* ------------------------------------------------------------------ */
/*  Mobile drawer sections — self-contained, composable                */
/* ------------------------------------------------------------------ */

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
