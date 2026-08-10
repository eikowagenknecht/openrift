import type { DeckListItemResponse } from "@openrift/shared";
import { Fragment } from "react";

import type { DeckMetaPartKey } from "@/lib/deck-meta";
import { deckMetaParts } from "@/lib/deck-meta";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

/** Amber emphasis for the ownership gap, shared by both renderings. */
const WARN_CLASS = "text-amber-600 dark:text-amber-500";

/**
 * Column widths for the `columns` rendering. Fixed so the numbers line up down
 * the whole list instead of shifting whenever a deck has nothing missing.
 */
const COLUMN_WIDTH: Record<DeckMetaPartKey, string> = {
  missing: "w-20",
  value: "w-16",
  updated: "w-24",
};

/**
 * The deck's stat summary: missing, value, updated date. The card count lives
 * on the format badge, as it does on the deck page.
 *
 * `inline` joins the stats with separators and lets the date wrap onto its own
 * line, for the grid tile and for list rows on phones. `columns` right-aligns
 * each part in a fixed-width cell, for list rows from `sm` up.
 * @returns The stat line.
 */
export function DeckMetaLine({
  item,
  variant = "inline",
  leading,
  className,
}: {
  item: DeckListItemResponse;
  variant?: "inline" | "columns";
  /**
   * The deck's format/state, rendered as the first fact. The list rows pass
   * `DeckFormatText` here rather than a badge, which is what stops the chip
   * eating the width the deck name needs.
   */
  leading?: React.ReactNode;
  className?: string;
}) {
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const priceFormatter = formatterForMarketplace(marketplaceOrder[0] ?? "cardtrader");
  const parts = deckMetaParts(item, (cents) => priceFormatter(cents / 100));

  if (variant === "columns") {
    return (
      <div className={cn("text-muted-foreground flex items-center gap-2 text-xs", className)}>
        {leading && <span className="w-32 shrink-0 truncate text-right">{leading}</span>}
        {parts.map((part) => (
          <span
            key={part.key}
            title={part.title}
            className={cn(
              "shrink-0 text-right tabular-nums",
              COLUMN_WIDTH[part.key],
              part.warn && part.text !== null && WARN_CLASS,
            )}
          >
            {part.text ?? <span className="text-muted-foreground/40">&mdash;</span>}
          </span>
        ))}
      </div>
    );
  }

  const date = parts.find((part) => part.key === "updated");
  const stats = parts.filter((part) => part.key !== "updated" && part.text !== null);

  return (
    // Wrapping with a wider gap between the two groups: the stats stay on one
    // line and the date drops below when the tile is too narrow for both, so
    // nothing is ever clipped by the tile's overflow-hidden.
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-baseline gap-x-3 text-xs",
        className,
      )}
    >
      <span className="whitespace-nowrap">
        {leading}
        {stats.map((part, index) => (
          <Fragment key={part.key}>
            {(leading || index > 0) && (
              <span className="px-1" aria-hidden="true">
                ·
              </span>
            )}
            <span className={cn(part.warn && WARN_CLASS)}>{part.text}</span>
          </Fragment>
        ))}
      </span>
      {date && (
        <span title={date.title} className="whitespace-nowrap">
          {date.inlineText ?? date.text}
        </span>
      )}
    </div>
  );
}
