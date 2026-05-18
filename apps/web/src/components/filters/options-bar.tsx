import type { AvailableFilters, FilterCounts, GroupByField, SortOption } from "@openrift/shared";
import {
  CopyIcon,
  LayoutGridIcon,
  MinusIcon,
  PlusIcon,
  Rows3Icon,
  SquareIcon,
  SquareStackIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { SortGroupControls } from "@/components/filters/sort-group-controls";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
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
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { FilterPanelContent } from "./filter-panel-content";

export const sortOptions: { value: SortOption; label: string }[] = [
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "energy", label: "Energy" },
  { value: "rarity", label: "Rarity" },
  { value: "price", label: "Price" },
];

export const defaultGroupByOptions: { value: GroupByField; label: string }[] = [
  { value: "none", label: "None" },
  { value: "set", label: "Set" },
  { value: "type", label: "Type" },
  { value: "superType", label: "Supertype" },
  { value: "domain", label: "Domain" },
  { value: "rarity", label: "Rarity" },
  { value: "channel", label: "Distribution Channel" },
  { value: "year", label: "Year" },
  { value: "marker", label: "Marker" },
];

export function DisplayModeToggle({
  compact,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const displayMode = useDisplayStore((state) => state.displayMode);
  const setDisplayMode = useDisplayStore((state) => state.setDisplayMode);
  const isMobile = useIsMobile();
  if (isMobile) {
    return null;
  }
  return (
    <ButtonGroup aria-label="Display mode" className={className}>
      {compact ? (
        <Button
          variant={displayMode === "grid" ? "default" : "outline"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setDisplayMode("grid")}
        >
          <LayoutGridIcon />
          Grid
        </Button>
      ) : (
        <Button
          variant={displayMode === "grid" ? "default" : "outline"}
          size="icon"
          onClick={() => setDisplayMode("grid")}
          title="Grid view"
          aria-label="Grid view"
          aria-pressed={displayMode === "grid"}
        >
          <LayoutGridIcon className="size-4" />
        </Button>
      )}
      {compact ? (
        <Button
          variant={displayMode === "table" ? "default" : "outline"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setDisplayMode("table")}
        >
          <Rows3Icon />
          Table
        </Button>
      ) : (
        <Button
          variant={displayMode === "table" ? "default" : "outline"}
          size="icon"
          onClick={() => setDisplayMode("table")}
          title="Table view"
          aria-label="Table view"
          aria-pressed={displayMode === "table"}
        >
          <Rows3Icon className="size-4" />
        </Button>
      )}
    </ButtonGroup>
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
    <ButtonGroup aria-label="View mode" className={className}>
      {compact ? (
        <Button
          variant={view === "cards" ? "default" : "outline"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => onViewChange("cards")}
        >
          <SquareIcon />
          Cards
        </Button>
      ) : (
        <Button
          variant={view === "cards" ? "default" : "outline"}
          size="icon"
          onClick={() => onViewChange("cards")}
          title="One per card"
        >
          <SquareIcon className="size-4" />
        </Button>
      )}
      {compact ? (
        <Button
          variant={view === "printings" ? "default" : "outline"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => onViewChange("printings")}
        >
          <CopyIcon />
          Printings
        </Button>
      ) : (
        <Button
          variant={view === "printings" ? "default" : "outline"}
          size="icon"
          onClick={() => onViewChange("printings")}
          title="Every printing"
        >
          <CopyIcon className="size-4" />
        </Button>
      )}
      {showCopies &&
        (compact ? (
          <Button
            variant={view === "copies" ? "default" : "outline"}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => onViewChange("copies")}
          >
            <SquareStackIcon />
            Copies
          </Button>
        ) : (
          <Button
            variant={view === "copies" ? "default" : "outline"}
            size="icon"
            onClick={() => onViewChange("copies")}
            title="Every individual copy"
          >
            <SquareStackIcon className="size-4" />
          </Button>
        ))}
    </ButtonGroup>
  );
}

function ColumnControls({
  compact,
  maxColumns,
  autoColumns,
  minColumns,
  maxColumnsLimit,
  onMaxColumnsChange,
}: {
  compact?: boolean;
  maxColumns: number | null;
  autoColumns: number;
  minColumns: number;
  maxColumnsLimit: number;
  onMaxColumnsChange: (v: number | null) => void;
}) {
  return (
    <ButtonGroup aria-label="Columns">
      <Button
        variant="outline"
        size={compact ? "sm" : "icon"}
        className={compact ? "size-7 p-0" : undefined}
        onClick={() => {
          if (maxColumns === null) {
            const next = autoColumns - 1;
            if (next >= minColumns) {
              onMaxColumnsChange(next);
            }
          } else if (maxColumns > minColumns) {
            onMaxColumnsChange(maxColumns - 1);
          }
        }}
        disabled={
          (maxColumns !== null && maxColumns <= minColumns) ||
          (maxColumns === null && autoColumns <= minColumns)
        }
        aria-label="Fewer columns"
      >
        <MinusIcon className={compact ? undefined : "size-4"} />
      </Button>
      <ButtonGroupText
        className={
          compact
            ? "flex min-w-7 cursor-pointer items-center justify-center text-xs tabular-nums"
            : "min-w-10 cursor-pointer justify-center tabular-nums"
        }
        onClick={() => {
          if (maxColumns !== null) {
            onMaxColumnsChange(null);
          }
        }}
        title={maxColumns === null ? "Auto columns" : "Reset to auto"}
      >
        {maxColumns === null ? "Auto" : maxColumns}
      </ButtonGroupText>
      <Button
        variant="outline"
        size={compact ? "sm" : "icon"}
        className={compact ? "size-7 p-0" : undefined}
        onClick={() => {
          const next = maxColumns === null ? autoColumns + 1 : maxColumns + 1;
          if (next <= maxColumnsLimit) {
            onMaxColumnsChange(next);
          }
        }}
        disabled={
          maxColumns === null ? autoColumns >= maxColumnsLimit : maxColumns >= maxColumnsLimit
        }
        aria-label="More columns"
      >
        <PlusIcon className={compact ? undefined : "size-4"} />
      </Button>
    </ButtonGroup>
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
  const maxColumnsLimit = useDisplayStore((s) => s.physicalMax);
  const minColumnsLimit = useDisplayStore((s) => s.physicalMin);
  const autoColumns = useDisplayStore((s) => s.autoColumns);

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
  groupByOptions = defaultGroupByOptions,
}: {
  className?: string;
  showCopies?: boolean;
  hideViewToggle?: boolean;
  /**
   * Override the default group-by options (e.g. /promos uses
   * channel/card/year/marker). `value` is widened to `string` because
   * surface-specific keys like "card" aren't in the shared `GroupByField` —
   * the URL is loosely typed and each surface re-parses on read.
   */
  groupByOptions?: { value: string; label: string }[];
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

  return (
    <div className={cn("items-center gap-3", className)}>
      <SortGroupControls
        sortOptions={sortOptions}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
        group={{
          options: groupByOptions,
          value: groupBy,
          dir: groupDir,
          onValueChange: (value) => setGroupBy(value as GroupByField),
          onDirChange: setGroupDir,
        }}
      />
      {!hideViewToggle && (
        <ViewModeToggle view={view} onViewChange={setView} showCopies={showCopies} />
      )}
      <DisplayModeToggle />
      {displayMode === "grid" && <ColumnControls {...columnProps} />}
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
  return (
    <Drawer>
      <DrawerTrigger
        render={
          <Button variant="outline" size="icon" className={cn("relative", className)}>
            <SlidersHorizontalIcon className="size-4" />
          </Button>
        }
        aria-label="Options"
      />
      <DrawerContent className="pb-2">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Options</DrawerTitle>
          <DrawerDescription>Sort, display, and filter options</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {children}
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button className="w-full">{doneLabel ?? "Done"}</Button>
          </DrawerClose>
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
  groupByOptions = defaultGroupByOptions,
}: {
  showCopies?: boolean;
  hideViewToggle?: boolean;
  /** See {@link DesktopOptionsBar} for why the value type is widened to `string`. */
  groupByOptions?: { value: string; label: string }[];
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

  return (
    <div className="space-y-2.5">
      <SortGroupControls
        compact
        sortOptions={sortOptions}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
        group={{
          options: groupByOptions,
          value: groupBy,
          dir: groupDir,
          onValueChange: (value) => setGroupBy(value as GroupByField),
          onDirChange: setGroupDir,
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {!hideViewToggle && (
          <ViewModeToggle compact view={view} onViewChange={setView} showCopies={showCopies} />
        )}
        <DisplayModeToggle compact />
        {displayMode === "grid" && (
          <div className="ml-auto">
            <ColumnControls compact {...columnProps} />
          </div>
        )}
      </div>
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
}: {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  visibleCustomTagCategories?: ReadonlySet<string>;
  filterOverrides?: Partial<Record<string, string[]>>;
  filterCounts?: FilterCounts;
}) {
  return (
    <div className="border-t pt-4">
      <p className="mb-2.5 text-sm font-medium">Filters</p>
      <div className="flex flex-col gap-4">
        <FilterPanelContent
          availableFilters={availableFilters}
          availableLanguages={availableLanguages}
          setDisplayLabel={setDisplayLabel}
          hiddenSections={hiddenSections}
          visibleCustomTagCategories={visibleCustomTagCategories}
          filterOverrides={filterOverrides}
          filterCounts={filterCounts}
        />
      </div>
    </div>
  );
}
