import { Radio } from "@base-ui/react/radio";
import { ArrowDownNarrowWideIcon, ArrowUpNarrowWideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface SortGroupOption<TValue extends string> {
  value: TValue;
  label: string;
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

function DirToggle({
  dir,
  onToggle,
}: {
  dir: "asc" | "desc";
  onToggle: (dir: "asc" | "desc") => void;
}) {
  return (
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
}

interface GroupSection<TGroup extends string> {
  options: SortGroupOption<TGroup>[];
  value: TGroup;
  dir: "asc" | "desc";
  onValueChange: (value: TGroup) => void;
  onDirChange: (value: "asc" | "desc") => void;
}

interface ViewSection<TView extends string> {
  options: SortGroupOption<TView>[];
  value: TView;
  onChange: (value: TView) => void;
  /** Section heading. Defaults to "View". */
  title?: string;
}

/**
 * Combined sort / group / view control: a popover trigger that summarizes the
 * current selection inline ("Group · Sort ↑"), with a panel exposing each
 * section and (where relevant) direction toggles. Use `compact` for the mobile
 * drawer layout (no popover).
 *
 * `group` is optional — pass `undefined` for routes that don't expose grouping
 * (e.g. /promos, where the page is hierarchical by channel and a flat groupBy
 * doesn't make sense). Pass `"none"` as the no-grouping value otherwise.
 *
 * `view` is optional — pass it to render a third section for view-mode toggles
 * (e.g. grid/list on /promos).
 *
 * @returns The control UI.
 */
export function SortGroupControls<
  TSort extends string,
  TGroup extends string = "none",
  TView extends string = string,
>({
  compact,
  sortOptions,
  group,
  view,
  sortBy,
  sortDir,
  onSortByChange,
  onSortDirChange,
}: {
  compact?: boolean;
  sortOptions: SortGroupOption<TSort>[];
  group?: GroupSection<TGroup>;
  view?: ViewSection<TView>;
  sortBy: TSort;
  sortDir: "asc" | "desc";
  onSortByChange: (value: TSort) => void;
  onSortDirChange: (value: "asc" | "desc") => void;
}) {
  const sortLabel = sortOptions.find((option) => option.value === sortBy)?.label ?? sortBy;
  const groupLabel =
    group && (group.options.find((option) => option.value === group.value)?.label ?? group.value);
  const groupingActive = group !== undefined && (group.value as string) !== "none";

  const renderOptions = <TValue extends string>(
    options: SortGroupOption<TValue>[],
    selectedValue: TValue,
    onSelect: (value: TValue) => void,
  ) => (
    <RadioGroup
      value={selectedValue}
      onValueChange={(value) => onSelect(value as TValue)}
      className={cn("gap-0.5", compact ? "flex flex-row flex-wrap gap-1" : "flex flex-col")}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={cn(
            "rounded-md px-2.5 py-1 text-left text-sm transition-colors outline-none",
            "data-checked:bg-accent data-checked:text-accent-foreground data-checked:font-medium",
            "data-unchecked:text-muted-foreground data-unchecked:hover:bg-accent/50 data-unchecked:hover:text-foreground",
          )}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );

  const groupSection = group && (
    <SortGroupSection
      title="Group by"
      action={
        groupingActive ? (
          // oxlint-disable-next-line react/jsx-handler-names -- forwarded callback from caller, name fixed by the route
          <DirToggle dir={group.dir} onToggle={group.onDirChange} />
        ) : undefined
      }
    >
      {renderOptions(group.options, group.value, group.onValueChange)}
    </SortGroupSection>
  );

  const sortSection = (
    <SortGroupSection
      title="Sort by"
      action={<DirToggle dir={sortDir} onToggle={onSortDirChange} />}
    >
      {renderOptions(sortOptions, sortBy, onSortByChange)}
    </SortGroupSection>
  );

  const viewSection = view && (
    <SortGroupSection title={view.title ?? "View"}>
      {renderOptions(view.options, view.value, view.onChange)}
    </SortGroupSection>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-3">
        {groupSection}
        {sortSection}
        {viewSection}
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "border-input bg-background ring-ring/10 dark:bg-input/30 hover:bg-muted hover:text-foreground dark:hover:bg-input/50 inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm whitespace-nowrap shadow-xs transition-colors",
        )}
      >
        {groupingActive && group && (
          <>
            <span>{groupLabel}</span>
            {group.dir === "desc" && (
              <ArrowUpNarrowWideIcon className="text-muted-foreground size-3.5" />
            )}
            <span className="text-muted-foreground">·</span>
          </>
        )}
        <span className={groupingActive ? "text-muted-foreground" : undefined}>{sortLabel}</span>
        {sortDir === "desc" && <ArrowUpNarrowWideIcon className="text-muted-foreground size-3.5" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-3 p-2">
        {groupSection}
        {groupSection && <div className="bg-border -mx-2 h-px" />}
        {sortSection}
        {viewSection && <div className="bg-border -mx-2 h-px" />}
        {viewSection}
      </PopoverContent>
    </Popover>
  );
}
