import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEnumOrders } from "@/hooks/use-enums";
import { DOMAIN_COLORS } from "@/lib/domain";

/**
 * Thin stacked bar showing domain color distribution for a deck.
 * @returns The domain bar, or null if no countable cards.
 */
export function DeckDomainBar({
  distribution,
}: {
  distribution: { domain: string; count: number }[];
}) {
  const { orders } = useEnumOrders();

  const total = distribution.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) {
    return null;
  }

  // Re-sort by canonical domain order from the database
  const orderIndex = new Map(orders.domains.map((domain, index) => [domain, index]));
  const segments = distribution.toSorted(
    (first, second) => (orderIndex.get(first.domain) ?? 99) - (orderIndex.get(second.domain) ?? 99),
  );

  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full">
      {segments.map((segment) => {
        const percent = ((segment.count / total) * 100).toFixed(1);
        return (
          <Tooltip key={segment.domain}>
            <TooltipTrigger
              className="h-full"
              style={{
                flexBasis: `${percent}%`,
                backgroundColor: DOMAIN_COLORS[segment.domain] ?? "#737373",
              }}
            />
            <TooltipContent side="bottom">
              {segment.domain}: {segment.count}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
