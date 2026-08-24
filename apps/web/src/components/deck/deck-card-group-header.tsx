import type { DeckCardGroup, DeckOverviewGroup } from "@/lib/deck-card-group";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The name + count line above one sub-group of a grouped deck zone. Shared by
 * the overview's list rows, its thumbnail wraps and its stacks-mode piles, so
 * the three read identically whatever the display mode.
 *
 * The single "none" group has no label, and renders nothing.
 *
 * @returns The group header, or null for the unlabelled group.
 */
export function DeckCardGroupHeader({
  group,
  groupBy,
  className,
  truncate,
}: {
  group: DeckCardGroup;
  /** The active grouping axis — type groups keep their icons. */
  groupBy: DeckOverviewGroup;
  /** Extra classes for the row (the list's grid padding). */
  className?: string;
  /**
   * Clamp a long label rather than let it set the row's width. Stacks mode
   * needs it: a pile is exactly one card wide.
   */
  truncate?: boolean;
}) {
  if (group.label === null) {
    return null;
  }
  const count = group.cards.reduce((sum, card) => sum + card.quantity, 0);
  const iconPath = groupBy === "type" ? getTypeIconPath(group.key, []) : undefined;
  return (
    <div
      className={cn(
        "text-muted-foreground flex items-center gap-1.5 text-xs",
        truncate && "min-w-0",
        className,
      )}
    >
      {iconPath && <img src={iconPath} alt="" className="size-3.5 brightness-0 dark:invert" />}
      <span className={truncate ? "truncate" : "whitespace-nowrap"}>
        {group.label} <span className="text-muted-foreground/60">· {count}</span>
      </span>
    </div>
  );
}
