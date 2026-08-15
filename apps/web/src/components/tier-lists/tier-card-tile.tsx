import { getOrientation } from "@openrift/shared";
import type { Card, Printing } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { frontImageId } from "@/lib/card-meta";
import { cn } from "@/lib/utils";
import { TIER_TILE_WIDTHS, useDisplayStore } from "@/stores/display-store";

/** Portrait card aspect as height ÷ width (63×88mm), for sizing a row off a tile. */
const TILE_ASPECT = 88 / 63;

/** Breathing room a row keeps around its tiles, matching `TierRowFrame`'s `p-1`. */
const ROW_PADDING = 8;

/**
 * The board's current tile width in pixels.
 * @returns The width every board tile renders at.
 */
export function useTierTileWidth(): number {
  const step = useDisplayStore((state) => state.tierTileStep);
  return TIER_TILE_WIDTHS[step] ?? TIER_TILE_WIDTHS[2];
}

/**
 * The row height a tile of `tileWidth` needs, so a row is exactly as tall empty
 * as it is holding cards — dropping the first card into a tier must not resize
 * it under the pointer.
 *
 * Deliberately fractional. The tile's own height is `tileWidth × TILE_ASPECT`
 * exactly (the thumb is `aspect-card`, which is the same 63/88), so rounding
 * this up to whole pixels left an empty row up to a pixel taller than a full
 * one — small, but it read as the ladder twitching as cards landed.
 *
 * @returns The row's minimum height in pixels, including its own padding.
 */
export function tierRowMinHeight(tileWidth: number): number {
  return tileWidth * TILE_ASPECT + ROW_PADDING;
}

export interface TierCardView {
  cardId: string;
  card: Card;
  /** The printing supplying the art: the creator's pinned one, else the default. */
  printing: Printing | undefined;
  /**
   * What the entry actually stores, as opposed to what got resolved. Null means
   * the entry follows the default printing, which is what the "Change printing"
   * menu needs to know to offer putting it back.
   */
  pinnedPrintingId: string | null;
}

interface TierCardTileProps {
  view: TierCardView;
  /** Tile width in pixels. Every board surface passes the same one. */
  width: number;
  className?: string;
}

/**
 * One ranked card as it appears on the board: art only, at the board's current
 * tile size. Ranking is per card rather than per printing, so this carries no
 * variant chrome — but which printing supplies the art is the creator's choice.
 *
 * @returns The card tile node.
 */
export function TierCardTile({ view, width, className }: TierCardTileProps) {
  // The width lives on a wrapper rather than on the thumb: the tile size is a
  // runtime number now, and CardArtThumb sizes itself from utility classes.
  //
  // align-top for the same reason CardArtThumb carries it, and it has to be
  // here too: wherever the tile is wrapped in something that is not a flex
  // container — the builder's drag div, the `Pressable` a clickable tile
  // renders as — it is an inline box on a text baseline, and the descender
  // space under that baseline made a row holding cards a few pixels taller
  // than an empty one. The row's min-height cannot absorb it: the gap is
  // *added* to the tile, so the row with cards in it always wins.
  return (
    <span className="inline-flex shrink-0 align-top" style={{ width }}>
      <CardArtThumb
        imageId={frontImageId(view.printing)}
        variant="400w"
        alt={view.card.name}
        rarity={view.printing?.rarity}
        domains={view.card.domains}
        landscape={getOrientation(view.card.types) === "landscape"}
        loading="lazy"
        className={cn("w-full", className)}
      />
    </span>
  );
}
