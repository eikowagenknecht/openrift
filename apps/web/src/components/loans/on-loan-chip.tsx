import { HandHeartIcon } from "lucide-react";

import { CountPill } from "@/components/ui/count-pill";

/**
 * Compact strip chip marking copies that are out on a loan (ADR-039): the
 * loan icon plus a count, with the wording in a tooltip. Non-interactive;
 * shown in the above-card strip on the lender's own tiles and on shared
 * collection views (without the borrower's identity).
 *
 * `count` is the displayed printing's on-loan copies, and `totalCount` is the
 * whole tile's figure across sibling printings (cards view), rendered dimmed
 * in parentheses only when the two diverge — the same summarization rule as
 * the count pill's "n (m)". `iconOnly` drops the number for copies-view
 * tiles, where the tile is a single copy and the count is always 1.
 * @returns The chip, or null when nothing is on loan.
 */
export function OnLoanChip({
  count,
  totalCount,
  iconOnly,
}: {
  count: number;
  totalCount?: number;
  iconOnly?: boolean;
}) {
  const showTotal = totalCount !== undefined && totalCount !== count;
  if (count <= 0 && !showTotal) {
    return null;
  }
  const title = iconOnly
    ? "On loan"
    : showTotal
      ? `${count} of this printing on loan (${totalCount} across all printings)`
      : `${count} ${count === 1 ? "copy" : "copies"} on loan`;
  return (
    <CountPill variant="ghost" title={title} aria-label={title}>
      <HandHeartIcon className="size-3" aria-hidden />
      {!iconOnly && (
        <>
          <span>{count}</span>
          {showTotal && <span className="opacity-60">({totalCount})</span>}
        </>
      )}
    </CountPill>
  );
}
