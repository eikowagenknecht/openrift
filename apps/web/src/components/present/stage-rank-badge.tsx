import { TIER_LABEL_INK, tierRowColor } from "@openrift/shared";

import { cn } from "@/lib/utils";

/**
 * The current card's tier, drawn to be read from across a room.
 *
 * A display label rather than a heading (see `docs/typography.md`): it is aimed
 * at whoever is watching the capture, not at someone reading the page. Painted
 * in the row's own colour on the board's label ink, so the badge and the tier
 * chip it stands for are visibly the same thing.
 *
 * @returns The rank badge node.
 */
export function StageRankBadge({
  label,
  rowIndex,
  unranked,
  className,
}: {
  label: string;
  /** Board row the card sits in, which is what picks the colour. */
  rowIndex: number;
  /** The grey "considered and cut" row, drawn off the ranking ramp. */
  unranked?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // wrap-anywhere for the same reason the board's chip has it: a renamed
        // tier ("Absolutely broken") reads on more than one line rather than
        // losing its tail.
        "font-heading rounded-lg px-4 py-2 text-center text-4xl font-bold wrap-anywhere",
        className,
      )}
      style={{ backgroundColor: tierRowColor(rowIndex, unranked), color: TIER_LABEL_INK }}
    >
      {label}
    </div>
  );
}
