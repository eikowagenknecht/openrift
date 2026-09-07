import { enumLabel } from "@openrift/shared/enum-label";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { getDomainColor } from "@/lib/domain";

export function DeckDomainBar({
  distribution,
}: {
  distribution: { domain: string; count: number }[];
}) {
  const { orders, labels } = useEnumOrders();
  const domainColors = useDomainColors();

  const total = distribution.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) {
    return null;
  }

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
            {/* Base UI's default trigger is a button; these were unlabelled tab stops, several per deck. */}
            <TooltipTrigger
              render={<span />}
              className="h-full"
              style={{
                flexBasis: `${percent}%`,
                backgroundColor: getDomainColor(segment.domain, domainColors),
              }}
            />
            <TooltipContent side="bottom">
              {enumLabel(labels.domains, segment.domain)}: {segment.count}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
