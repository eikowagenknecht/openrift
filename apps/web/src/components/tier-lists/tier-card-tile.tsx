import { getOrientation } from "@openrift/shared";
import type { Card, Printing } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { frontImageId } from "@/lib/card-meta";
import { cn } from "@/lib/utils";

/** Tailwind width of a board tile. One constant so every board surface — row,
 * drag overlay, index preview — sizes a card identically. */
const TIER_TILE_WIDTH = "w-12 sm:w-14";

export interface TierCardView {
  cardId: string;
  card: Card;
  /** The card's default printing, which supplies the art. */
  printing: Printing | undefined;
}

interface TierCardTileProps {
  view: TierCardView;
  className?: string;
}

/**
 * One ranked card as it appears on the board: art only, at the size the ladder
 * uses. Ranking is per card rather than per printing, so this always shows the
 * card's default printing and carries no variant chrome.
 *
 * @returns The card tile node.
 */
export function TierCardTile({ view, className }: TierCardTileProps) {
  return (
    <CardArtThumb
      imageId={frontImageId(view.printing)}
      variant="400w"
      alt={view.card.name}
      rarity={view.printing?.rarity}
      domains={view.card.domains}
      landscape={getOrientation(view.card.types) === "landscape"}
      loading="lazy"
      className={cn(TIER_TILE_WIDTH, className)}
    />
  );
}
