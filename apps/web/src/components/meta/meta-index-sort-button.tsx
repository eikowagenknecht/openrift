import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { Pressable } from "@/components/ui/pressable";
import { cn } from "@/lib/utils";

/**
 * One column label in an archive index's header row, doubling as its sort
 * control: a click sorts by the column, a second click flips the direction.
 * Shared by the tournament and legend indexes so the headers read the same.
 */
export function IndexSortButton<TColumn extends string>({
  column,
  sort,
  direction,
  onSort,
  align = "start",
  children,
}: {
  column: TColumn;
  sort: TColumn;
  direction: "asc" | "desc";
  onSort: (column: TColumn) => void;
  align?: "start" | "end";
  children: string;
}) {
  const active = sort === column;
  const Arrow = direction === "asc" ? ChevronUpIcon : ChevronDownIcon;
  const order = direction === "asc" ? "ascending" : "descending";
  return (
    <Pressable
      className={cn(
        "hover:text-foreground flex min-w-0 items-center gap-1 rounded-xs",
        active && "text-foreground",
        align === "end" && "justify-end",
      )}
      aria-label={active ? `${children}, sorted ${order}` : `Sort by ${children.toLowerCase()}`}
      onClick={() => onSort(column)}
    >
      <span className="truncate">{children}</span>
      {active && <Arrow className="size-3 shrink-0" />}
    </Pressable>
  );
}
