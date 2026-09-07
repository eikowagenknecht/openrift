import { getOrientation, legendDisplayName } from "@openrift/shared/utils";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { frontImageId } from "@/lib/card-meta";
import type { TierCardView } from "@/lib/tier-list-presentation";
import { cn } from "@/lib/utils";
import { TIER_TILE_WIDTHS, useDisplayStore } from "@/stores/display-store";

const TILE_ASPECT = 88 / 63;

const ROW_PADDING = 8;

export function useTierTileWidth(): number {
  const step = useDisplayStore((state) => state.tierTileStep);
  return TIER_TILE_WIDTHS[step] ?? TIER_TILE_WIDTHS[2];
}

/**
 * Deliberately fractional: rounding this up left an empty row up to a pixel
 * taller than a full one, which read as the ladder twitching as cards landed.
 */
export function tierRowMinHeight(tileWidth: number): number {
  return tileWidth * TILE_ASPECT + ROW_PADDING;
}

interface TierCardTileProps {
  view: TierCardView;
  width: number;
  className?: string;
}

export function TierCardTile({ view, width, className }: TierCardTileProps) {
  // Wrapper carries width; CardArtThumb only sizes via utility classes. align-top
  // avoids inline-box descender space that made full rows taller than empty ones.
  return (
    <span className="inline-flex shrink-0 align-top" style={{ width }}>
      <CardArtThumb
        imageId={frontImageId(view.printing)}
        variant="400w"
        alt={legendDisplayName(view.card)}
        rarity={view.printing?.rarity}
        domains={view.card.domains}
        landscape={getOrientation(view.card.types) === "landscape"}
        loading="lazy"
        className={cn("w-full", className)}
      />
    </span>
  );
}
