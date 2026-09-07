import type { DeckCardGroup, DeckOverviewGroup } from "@/features/decks/lib/deck-card-group";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Shared by the overview's list rows, thumbnail wraps, and stacks-mode piles
 * so all three read identically. The "none" group has no label and renders nothing.
 */
export function DeckCardGroupHeader({
  group,
  groupBy,
  className,
  truncate,
}: {
  group: DeckCardGroup;
  groupBy: DeckOverviewGroup;
  className?: string;
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
