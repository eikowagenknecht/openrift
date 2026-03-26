import type { AvailableFilters, SortOption } from "@openrift/shared";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Minus,
  Plus,
  Square,
  SquareStack,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/* ------------------------------------------------------------------ */
/*  Shared sub-components (desktop / mobile via `compact` prop)       */
/* ------------------------------------------------------------------ */

function SortControls({
  compact,
  sortBy,
  sortDir,
  onSortByChange,
  onSortDirChange,
}: {
  compact?: boolean;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  onSortByChange: (v: SortOption) => void;
  onSortDirChange: (v: "asc" | "desc") => void;
}) {
  return (
    <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
      <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortOption)}>
        <SelectTrigger
          size={compact ? "sm" : undefined}
          className={compact ? "flex-1 text-xs" : "w-[160px]"}
          aria-label="Sort by"
        >
          <span className="text-muted-foreground">Sort:&nbsp;</span>
          <SelectValue placeholder="Sort by">
            {(value: string) => sortOptions.find((o) => o.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size={compact ? "sm" : "icon"}
        className={compact ? "size-7 p-0" : undefined}
        onClick={() => onSortDirChange(sortDir === "asc" ? "desc" : "asc")}
        title={sortDir === "asc" ? "Ascending" : "Descending"}
      >
        {sortDir === "asc" ? (
          <ArrowDownNarrowWide className={compact ? undefined : "size-4"} />
        ) : (
          <ArrowUpNarrowWide className={compact ? undefined : "size-4"} />
        )}
      </Button>
    </div>
  );
}

function ViewModeToggle({
  compact,
  view,
  onViewChange,
  className,
}: {
  compact?: boolean;
  view: "cards" | "printings";
  onViewChange: (v: "cards" | "printings") => void;
  className?: string;
}) {
  return (
    <ButtonGroup aria-label="View mode" className={className}>
      <Button
        variant={view === "cards" ? "default" : "outline"}
        size={compact ? "sm" : "icon"}
        className={compact ? "gap-1.5 text-xs" : undefined}
        onClick={() => onViewChange("cards")}
        title={compact ? undefined : "One per card"}
      >
        <Square className={compact ? undefined : "size-4"} />
        {compact && "Cards"}
      </Button>
      <Button
        variant={view === "printings" ? "default" : "outline"}
        size={compact ? "sm" : "icon"}
        className={compact ? "gap-1.5 text-xs" : undefined}
        onClick={() => onViewChange("printings")}
        title={compact ? undefined : "Every printing"}
      >
        <SquareStack className={compact ? undefined : "size-4"} />
        {compact && "Printings"}
      </Button>
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
        <Minus className={compact ? undefined : "size-4"} />
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
        <Plus className={compact ? undefined : "size-4"} />
      </Button>
    </ButtonGroup>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared hook                                                        */
/* ------------------------------------------------------------------ */

function useOptionsBarState() {
  const { sortBy, sortDir, hasActiveFilters, view } = useFilterValues();
  const { setSortBy, setSortDir, setView } = useFilterActions();

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
    columnProps,
  };
}

/* ------------------------------------------------------------------ */
/*  DesktopOptionsBar — visible sm and up                              */
/* ------------------------------------------------------------------ */

export function DesktopOptionsBar({ className }: { className?: string }) {
  const { sortBy, sortDir, setSortBy, setSortDir, view, setView, columnProps } =
    useOptionsBarState();

  return (
    <div className={cn("items-center gap-3", className)}>
      <SortControls
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
      />
      <ViewModeToggle view={view} onViewChange={setView} />
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
        <SlidersHorizontal className="size-4" />
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

export function MobileOptionsContent() {
  const { sortBy, sortDir, setSortBy, setSortDir, view, setView, columnProps } =
    useOptionsBarState();

  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium">Options</p>
      <SortControls
        compact
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
      />
      <div className="flex items-center gap-2">
        <ViewModeToggle compact view={view} onViewChange={setView} className="mr-auto" />
        <ColumnControls compact {...columnProps} />
      </div>
    </div>
  );
}

export function MobileFilterContent({
  availableFilters,
  setDisplayLabel,
}: {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
}) {
  return (
    <div className="border-t pt-4">
      <p className="mb-2.5 text-sm font-medium">Filters</p>
      <div className="flex flex-col gap-4">
        <FilterPanelContent availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      </div>
    </div>
  );
}
