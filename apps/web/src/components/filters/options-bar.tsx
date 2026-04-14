import type { AvailableFilters, GroupByField, SortOption } from "@openrift/shared";
import {
  ArrowDownNarrowWideIcon,
  ArrowUpNarrowWideIcon,
  CopyIcon,
  MinusIcon,
  PlusIcon,
  SquareIcon,
  SquareStackIcon,
  SlidersHorizontalIcon,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/* ------------------------------------------------------------------ */
/*  Shared sub-components (desktop / mobile via `compact` prop)       */
/* ------------------------------------------------------------------ */

function RadioOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-md px-2.5 py-1 text-left text-sm transition-colors",
        selected
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SortGroupSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2.5">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function SortGroupControls({
  compact,
  sortBy,
  sortDir,
  groupBy,
  groupDir,
  onSortByChange,
  onSortDirChange,
  onGroupByChange,
  onGroupDirChange,
}: {
  compact?: boolean;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  groupBy: GroupByField;
  groupDir: "asc" | "desc";
  onSortByChange: (v: SortOption) => void;
  onSortDirChange: (v: "asc" | "desc") => void;
  onGroupByChange: (v: GroupByField) => void;
  onGroupDirChange: (v: "asc" | "desc") => void;
}) {
  const sortLabel = sortOptions.find((o) => o.value === sortBy)?.label ?? sortBy;
  const groupLabel = groupByOptions.find((o) => o.value === groupBy)?.label ?? groupBy;

  const dirToggle = (dir: "asc" | "desc", onToggle: (v: "asc" | "desc") => void) => (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground -mr-1 rounded p-0.5 transition-colors"
      onClick={() => onToggle(dir === "asc" ? "desc" : "asc")}
      title={dir === "asc" ? "Ascending, click to reverse" : "Descending, click to reverse"}
    >
      {dir === "asc" ? (
        <ArrowDownNarrowWideIcon className="size-3.5" />
      ) : (
        <ArrowUpNarrowWideIcon className="size-3.5" />
      )}
    </button>
  );

  if (compact) {
    // Mobile: inline sections without popover
    return (
      <div className="flex flex-col gap-3">
        <SortGroupSection
          title="Group by"
          action={groupBy === "none" ? undefined : dirToggle(groupDir, onGroupDirChange)}
        >
          <div className="flex flex-wrap gap-1">
            {groupByOptions.map((option) => (
              <RadioOption
                key={option.value}
                selected={groupBy === option.value}
                onClick={() => onGroupByChange(option.value)}
              >
                {option.label}
              </RadioOption>
            ))}
          </div>
        </SortGroupSection>
        <SortGroupSection title="Sort by" action={dirToggle(sortDir, onSortDirChange)}>
          <div className="flex flex-wrap gap-1">
            {sortOptions.map((option) => (
              <RadioOption
                key={option.value}
                selected={sortBy === option.value}
                onClick={() => onSortByChange(option.value)}
              >
                {option.label}
              </RadioOption>
            ))}
          </div>
        </SortGroupSection>
      </div>
    );
  }

  // Desktop: popover trigger
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "border-input bg-background ring-ring/10 dark:bg-input/30 hover:bg-muted hover:text-foreground dark:hover:bg-input/50 inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm whitespace-nowrap shadow-xs transition-colors",
        )}
      >
        {groupBy !== "none" && (
          <>
            <span>{groupLabel}</span>
            {groupDir === "desc" && (
              <ArrowUpNarrowWideIcon className="text-muted-foreground size-3.5" />
            )}
            <span className="text-muted-foreground">·</span>
          </>
        )}
        <span className={groupBy === "none" ? undefined : "text-muted-foreground"}>
          {sortLabel}
        </span>
        {sortDir === "desc" && <ArrowUpNarrowWideIcon className="text-muted-foreground size-3.5" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-3 p-2">
        <SortGroupSection
          title="Group by"
          action={groupBy === "none" ? undefined : dirToggle(groupDir, onGroupDirChange)}
        >
          {groupByOptions.map((option) => (
            <RadioOption
              key={option.value}
              selected={groupBy === option.value}
              onClick={() => onGroupByChange(option.value)}
            >
              {option.label}
            </RadioOption>
          ))}
        </SortGroupSection>
        <div className="bg-border -mx-2 h-px" />
        <SortGroupSection title="Sort by" action={dirToggle(sortDir, onSortDirChange)}>
          {sortOptions.map((option) => (
            <RadioOption
              key={option.value}
              selected={sortBy === option.value}
              onClick={() => onSortByChange(option.value)}
            >
              {option.label}
            </RadioOption>
          ))}
        </SortGroupSection>
      </PopoverContent>
    </Popover>
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
}: {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  filterOverrides?: Partial<Record<string, string[]>>;
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
        />
      </div>
    </div>
  );
}
