import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";
import type { OwnedBreakdownVariant } from "@/hooks/use-owned-count";

interface OwnedCountStripProps {
  count: number;
  printingId?: string;
  cardName?: string;
  shortCode?: string;
  /** All sibling printings of the same card (cards view), passed to the popover for per-variant breakdown. */
  siblings?: readonly OwnedBreakdownVariant[];
}

/**
 * Compact owned-count label rendered above the card image in browse/select modes.
 * Matches the dimensions of AddStrip (h-5 + mb-1 = 24px) so the virtualizer row
 * height estimate stays consistent across all collection view modes.
 * When a `printingId` is provided, clicking the count opens a collection breakdown popover.
 * @returns The owned-count strip.
 */
export function OwnedCountStrip({
  count,
  printingId,
  cardName,
  shortCode,
  siblings,
}: OwnedCountStripProps) {
  return (
    // ⚠ h-5 + mb-1 = 24px is mirrored as ADD_STRIP_HEIGHT in card-grid-constants — update both together
    <div className="relative z-30 mb-1 flex h-5 items-center justify-center">
      {printingId && cardName && shortCode ? (
        <OwnedCollectionsPopover
          printingId={printingId}
          cardName={cardName}
          shortCode={shortCode}
          count={count}
          siblings={siblings}
          align="center"
        />
      ) : (
        <span className="text-muted-foreground text-xs font-medium">&times;{count}</span>
      )}
    </div>
  );
}
