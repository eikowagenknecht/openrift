import type { MetaDeckSummary } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import {
  MetaDeckByline,
  MetaDeckFrame,
  MetaDeckIdentityLine,
} from "@/components/meta/meta-deck-card";
import { Badge } from "@/components/ui/badge";
import { useDeckFormatList } from "@/hooks/use-enums";

/**
 * One archived deck as a compact row, the shape an event page lists its field
 * in. `MetaDeckCard` stays the deck browser's rendering; both share the byline
 * and the identity line, so a deck reads the same either way.
 *
 * The art is the deck's legend (its champion when there is no legend), through
 * the same thumbnail every other list uses — the archive carries denormalized
 * image ids, so nothing here touches the catalog.
 *
 * @returns The deck row element.
 */
export function MetaDeckRow({ deck }: { deck: MetaDeckSummary }) {
  const { labels: formatLabels } = useDeckFormatList();
  const artImageId = deck.legendImageId ?? deck.championImageId;

  return (
    <MetaDeckFrame deck={deck} className="flex items-center gap-3 px-3 py-2">
      <CardArtThumb imageId={artImageId} loading="lazy" className="h-12" />

      <div className="min-w-0 flex-1">
        <h3 className="truncate leading-tight font-semibold">{deck.name}</h3>
        <MetaDeckIdentityLine deck={deck} />
        {/* Below md the row has no width for a column of its own, so the
            placement rides under the name instead of dropping off the row. */}
        <MetaDeckByline deck={deck} className="mt-0.5 text-sm md:hidden" />
      </div>

      <MetaDeckByline deck={deck} className="hidden shrink-0 text-sm md:flex" />

      <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
        {formatLabels[deck.format] ?? deck.format}
      </Badge>
    </MetaDeckFrame>
  );
}
