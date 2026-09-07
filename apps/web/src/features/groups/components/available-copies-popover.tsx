import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OwnedVariantBreakdown } from "@/features/cards/components/owned-variant-breakdown";
import { useCards } from "@/features/cards/hooks/use-cards";
import type { VariantCollectionBreakdownEntry } from "@/features/collections/hooks/use-owned-count";
import { useOwnedCollectionsByVariants } from "@/features/collections/hooks/use-owned-count";

function countCopies(variants: readonly VariantCollectionBreakdownEntry[]): number {
  let total = 0;
  for (const variant of variants) {
    for (const entry of variant.collections) {
      total += entry.count;
    }
  }
  return total;
}

/**
 * Split from the trigger on purpose: the breakdown's live query reads the
 * *whole* copies collection, so keeping it here means it only runs while the
 * popover is open, not once per row in a suggestions list.
 */
function AvailableCopiesBreakdown({ cardId }: { cardId: string }) {
  const { printingsByCardId } = useCards();
  // Every sibling printing, not just the matched one: a spare in another
  // variant also answers "do I still have this card if I hand this one over".
  const siblings = printingsByCardId.get(cardId) ?? [];
  const { data: breakdown } = useOwnedCollectionsByVariants(siblings, true);

  if (breakdown === undefined) {
    return <p className="text-muted-foreground px-3 py-2.5 text-sm">Counting your copies…</p>;
  }

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          In your collections
        </p>
        <span className="text-muted-foreground text-xs tabular-nums">
          {countCopies(breakdown)} total
        </span>
      </div>
      {breakdown.length === 0 ? (
        // Reachable when the offered copies live in a group collection: those
        // belong to the group, so they never count as the viewer's own.
        <p className="text-muted-foreground px-3 pt-1 pb-2.5 text-sm">
          None in your own collections.
        </p>
      ) : (
        <OwnedVariantBreakdown variants={breakdown} />
      )}
    </>
  );
}

/**
 * The "N available" count on an outgoing suggestion, opened up into what the
 * viewer actually owns of that card.
 *
 * Outgoing rows only. On an incoming row the same number counts the *other*
 * side's copies.
 */
export function AvailableCopiesPopover({
  cardId,
  availableCount,
}: {
  cardId: string;
  availableCount: number;
}) {
  return (
    <Popover>
      <PopoverTrigger
        // The suggestion row around this one is clickable on some surfaces.
        onClick={(event) => event.stopPropagation()}
        className="hover:text-foreground focus-visible:ring-ring cursor-pointer underline decoration-dotted underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {availableCount} available
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-60 p-0">
        <AvailableCopiesBreakdown cardId={cardId} />
      </PopoverContent>
    </Popover>
  );
}
