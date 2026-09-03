import { Link } from "@tanstack/react-router";

import { FinishIcon } from "@/components/cards/finish-icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { useEnumOrders } from "@/hooks/use-enums";
import type { VariantCollectionBreakdownEntry } from "@/hooks/use-owned-count";
import { cn } from "@/lib/utils";

/**
 * Where a card's copies actually sit: one section per sibling printing the
 * viewer owns at least one copy of, each listing the personal collections that
 * hold it and how many. Every row links into that collection filtered to the
 * variant, so the breakdown doubles as a way to go look at the copies.
 *
 * Shared by the card detail's owned-count popover and the trade sheet's
 * available-count popover, so "which variants, where" reads the same on both.
 * @returns The grouped breakdown list.
 */
export function OwnedVariantBreakdown({
  variants,
}: {
  variants: readonly VariantCollectionBreakdownEntry[];
}) {
  const { labels } = useEnumOrders();
  return (
    <div className="px-1 pb-1">
      {variants.map((variant) => (
        <div key={variant.printingId} className="px-1 pb-1 last:pb-0">
          <SectionHeading as="h3" className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5">
            <span>{variant.shortCode}</span>
            <FinishIcon
              finish={variant.finish}
              title={labels.finishes[variant.finish]}
              iconClassName="size-3"
            />
          </SectionHeading>
          <ul>
            {variant.collections.map((entry) => (
              <li key={entry.collectionId}>
                <Link
                  to="/collections/$collectionId"
                  params={{ collectionId: entry.collectionId }}
                  search={{ search: `id:${variant.shortCode}`, view: "printings" }}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-1 text-sm",
                    "hover:bg-muted transition-colors",
                  )}
                >
                  <span className="truncate">{entry.collectionName}</span>
                  <span className="text-muted-foreground ml-2 shrink-0 tabular-nums">
                    &times;{entry.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
