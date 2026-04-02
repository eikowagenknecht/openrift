import type { DeckCardResponse } from "@openrift/shared";
import { DOMAIN_ORDER } from "@openrift/shared";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DOMAIN_COLORS } from "@/lib/domain";

const COUNTED_ZONES = new Set(["main", "champion"]);

/**
 * Thin stacked bar showing domain color distribution for a deck.
 * @returns The domain bar, or null if no countable cards.
 */
export function DeckDomainBar({ cards }: { cards: DeckCardResponse[] }) {
  const countsByDomain = new Map<string, number>();
  let total = 0;

  for (const card of cards) {
    if (!COUNTED_ZONES.has(card.zone)) {
      continue;
    }
    for (const domain of card.domains) {
      countsByDomain.set(domain, (countsByDomain.get(domain) ?? 0) + card.quantity);
      total += card.quantity;
    }
  }

  if (total === 0) {
    return null;
  }

  const segments = DOMAIN_ORDER.filter((domain) => countsByDomain.has(domain)).map((domain) => ({
    domain,
    count: countsByDomain.get(domain) ?? 0,
    color: DOMAIN_COLORS[domain] ?? "#737373",
    percent: (((countsByDomain.get(domain) ?? 0) / total) * 100).toFixed(1),
  }));

  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full">
      {segments.map((segment) => (
        <Tooltip key={segment.domain}>
          <TooltipTrigger
            className="h-full"
            style={{
              flexBasis: `${segment.percent}%`,
              backgroundColor: segment.color,
            }}
          />
          <TooltipContent side="bottom">
            {segment.domain}: {segment.count}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
