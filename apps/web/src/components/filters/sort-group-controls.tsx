import { ArrowDownNarrowWideIcon, ArrowUpNarrowWideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SortGroupOption<TValue extends string> {
  value: TValue;
  label: string;
}

interface RadioOptionProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

function RadioOption({ selected, onClick, children }: RadioOptionProps) {
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

/**
 * Combined sort + group control: a popover trigger that summarizes the current
 * selection inline ("Group · Sort ↑"), with a panel exposing both sections and
 * direction toggles. Use `compact` for the mobile drawer layout (no popover).
 *
 * Generic over the sort and group field types. Pass `"none"` as the no-grouping
 * value (matches the convention used by `/cards`).
 *
 * @returns The control UI.
 */
export function SortGroupControls<TSort extends string, TGroup extends string>({
  compact,
  sortOptions,
  groupOptions,
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
  sortOptions: SortGroupOption<TSort>[];
  groupOptions: SortGroupOption<TGroup>[];
  sortBy: TSort;
  sortDir: "asc" | "desc";
  groupBy: TGroup;
  groupDir: "asc" | "desc";
  onSortByChange: (value: TSort) => void;
  onSortDirChange: (value: "asc" | "desc") => void;
  onGroupByChange: (value: TGroup) => void;
  onGroupDirChange: (value: "asc" | "desc") => void;
}) {
  const sortLabel = sortOptions.find((option) => option.value === sortBy)?.label ?? sortBy;
  const groupLabel = groupOptions.find((option) => option.value === groupBy)?.label ?? groupBy;
  const groupingActive = (groupBy as string) !== "none";

  if (compact) {
    return (
      <div className="flex flex-col gap-3">
        <SortGroupSection
          title="Group by"
          action={
            groupingActive ? <DirToggle dir={groupDir} onToggle={onGroupDirChange} /> : undefined
          }
        >
          <div className="flex flex-wrap gap-1">
            {groupOptions.map((option) => (
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
        <SortGroupSection
          title="Sort by"
          action={<DirToggle dir={sortDir} onToggle={onSortDirChange} />}
        >
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

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "border-input bg-background ring-ring/10 dark:bg-input/30 hover:bg-muted hover:text-foreground dark:hover:bg-input/50 inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm whitespace-nowrap shadow-xs transition-colors",
        )}
      >
        {groupingActive && (
          <>
            <span>{groupLabel}</span>
            {groupDir === "desc" && (
              <ArrowUpNarrowWideIcon className="text-muted-foreground size-3.5" />
            )}
            <span className="text-muted-foreground">·</span>
          </>
        )}
        <span className={groupingActive ? "text-muted-foreground" : undefined}>{sortLabel}</span>
        {sortDir === "desc" && <ArrowUpNarrowWideIcon className="text-muted-foreground size-3.5" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-3 p-2">
        <SortGroupSection
          title="Group by"
          action={
            groupingActive ? <DirToggle dir={groupDir} onToggle={onGroupDirChange} /> : undefined
          }
        >
          {groupOptions.map((option) => (
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
        <SortGroupSection
          title="Sort by"
          action={<DirToggle dir={sortDir} onToggle={onSortDirChange} />}
        >
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
