import type { AvailableFilters, FilterCounts, GroupByField, SortOption } from "@openrift/shared";
import {
  CopyIcon,
  MinusIcon,
  PlusIcon,
  SquareIcon,
  SquareStackIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

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
} from "@/components/ui/drawer";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { FilterPanelContent } from "./filter-panel-content";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "energy", label: "Energy" },
  { value: "rarity", label: "Rarity" },
  { value: "price", label: "Price" },
];

const groupByOptions: { value: GroupByField; label: string }[] = [
  { value: "none", label: "None" },
  { value: "set", label: "Set" },
  { value: "type", label: "Type" },
  { value: "superType", label: "Supertype" },
  { value: "domain", label: "Domain" },
  { value: "rarity", label: "Rarity" },
];

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
  };
}

/* ------------------------------------------------------------------ */
/*  DesktopOptionsBar — visible sm and up                              */
/* ------------------------------------------------------------------ */

export function DesktopOptionsBar({
  className,
  showCopies,
  hideViewToggle,
}: {
  className?: string;
  showCopies?: boolean;
  hideViewToggle?: boolean;
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
  } = useOptionsBarState();

  return (
    <div className={cn("items-center gap-3", className)}>
      <SortGroupControls
        sortOptions={sortOptions}
        groupOptions={groupByOptions}
        sortBy={sortBy}
        sortDir={sortDir}
        groupBy={groupBy}
        groupDir={groupDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
        onGroupByChange={setGroupBy}
        onGroupDirChange={setGroupDir}
      />
      {!hideViewToggle && (
        <ViewModeToggle view={view} onViewChange={setView} showCopies={showCopies} />
      )}
      <ColumnControls {...columnProps} />
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
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="icon"
        className="relative"
        onClick={() => setSheetOpen(true)}
        aria-label="Options"
      >
        <SlidersHorizontalIcon className="size-4" />
      </Button>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile drawer sections — self-contained, composable                */
/* ------------------------------------------------------------------ */

export function MobileOptionsContent({ showCopies }: { showCopies?: boolean } = {}) {
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
  } = useOptionsBarState();

  return (
    <div className="space-y-2.5">
      <SortGroupControls
        compact
        sortOptions={sortOptions}
        groupOptions={groupByOptions}
        sortBy={sortBy}
        sortDir={sortDir}
        groupBy={groupBy}
        groupDir={groupDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
        onGroupByChange={setGroupBy}
        onGroupDirChange={setGroupDir}
      />
      <div className="flex items-center gap-2">
        <ViewModeToggle
          compact
          view={view}
          onViewChange={setView}
          showCopies={showCopies}
          className="mr-auto"
        />
        <ColumnControls compact {...columnProps} />
      </div>
    </div>
  );
}

export function MobileFilterContent({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  filterOverrides,
  filterCounts,
}: {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
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
          filterOverrides={filterOverrides}
          filterCounts={filterCounts}
        />
      </div>
    </div>
  );
}
