import { Badge } from "@/components/ui/badge";

/**
 * Corner pill over a card image marking copies that are out on a loan
 * (ADR-039). Non-interactive; shown on the lender's own tiles and on shared
 * collection views (without the borrower's identity).
 *
 * Always numeric: `count` is the displayed printing's on-loan copies, and
 * `totalCount` is the whole tile's figure across sibling printings (cards
 * view), rendered dimmed in parentheses only when the two diverge — the same
 * summarization rule as the count pill's "×n (m)" above the card.
 * @returns The badge overlay, or null when nothing is on loan.
 */
export function OnLoanBadge({ count, totalCount }: { count: number; totalCount?: number }) {
  const showTotal = totalCount !== undefined && totalCount !== count;
  if (count <= 0 && !showTotal) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2">
      <Badge variant="secondary">
        <span>{count}</span>
        {showTotal && <span className="opacity-60">({totalCount})</span>}
        <span>on loan</span>
      </Badge>
    </div>
  );
}
