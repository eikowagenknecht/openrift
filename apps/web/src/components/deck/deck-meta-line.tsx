import type { DeckListItemResponse } from "@openrift/shared";
import { Fragment } from "react";

import { useHomeCollection } from "@/hooks/use-home-collection";
import type { DeckMetaPartKey } from "@/lib/deck-meta";
import { deckMetaParts } from "@/lib/deck-meta";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const WARN_CLASS = "text-warning";

/** Fixed so the numbers line up down the whole list. */
const COLUMN_WIDTH: Partial<Record<DeckMetaPartKey, string>> = {
  missing: "w-20",
  value: "w-16",
  updated: "w-24",
};

/**
 * `inline` joins the stats with separators and wraps the box/date onto their
 * own lines. `columns` right-aligns each part in a fixed-width cell, minus
 * the box, which the row places next to the deck name.
 */
export function DeckMetaLine({
  item,
  variant = "inline",
  leading,
  className,
}: {
  item: DeckListItemResponse;
  variant?: "inline" | "columns";
  leading?: React.ReactNode;
  className?: string;
}) {
  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const priceFormatter = formatterForMarketplace(marketplaceOrder[0] ?? "cardtrader");
  const box = useHomeCollection(item.deck.collectionId);
  const parts = deckMetaParts(item, (cents) => priceFormatter(cents / 100), box?.name);

  if (variant === "columns") {
    // The box is free text among fixed-width numbers, so a column of its own
    // could only truncate; the list row renders it beside the deck name instead.
    const columnParts = parts.filter((part) => part.key !== "box");
    return (
      <div className={cn("text-muted-foreground flex items-center gap-2 text-xs", className)}>
        {leading && <span className="w-32 shrink-0 truncate text-right">{leading}</span>}
        {columnParts.map((part) => (
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
  const boxPart = parts.find((part) => part.key === "box");
  const stats = parts.filter(
    (part) => part.key !== "updated" && part.key !== "box" && part.text !== null,
  );

  return (
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
      {boxPart?.text && (
        <span title={boxPart.title} className="min-w-0 truncate">
          {boxPart.text}
        </span>
      )}
      {date && (
        <span title={date.title} className="whitespace-nowrap">
          {date.inlineText ?? date.text}
        </span>
      )}
    </div>
  );
}
