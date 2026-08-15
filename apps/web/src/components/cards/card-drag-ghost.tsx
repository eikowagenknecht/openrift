import { getOrientation } from "@openrift/shared";
import type { Card, ImageVariant, Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CARD_ASPECT_INVERSE } from "@/components/cards/card-grid-constants";
import { frontImageId } from "@/lib/card-meta";
import { cn } from "@/lib/utils";

/**
 * Default ghost width in pixels — the `w-28` every card drag overlay hardcoded
 * before they shared one. Surfaces with their own card sizing (the tier board,
 * whose tiles are user-resizable) pass their own.
 */
export const CARD_DRAG_GHOST_WIDTH = 112;

/**
 * Where the second and third cards of a fan sit, as fractions of the ghost's
 * width so the fan holds its shape at any size. The values are the original
 * 112px-wide offsets (12/24px across, -4/-2px up) divided by that width.
 */
const FAN_OFFSETS = [
  { x: 0, y: 0, rotate: 0 },
  { x: 0.107, y: -0.036, rotate: 6 },
  { x: 0.214, y: -0.018, rotate: 12 },
];

/** How far a lone card tilts. A fan tilts through {@link FAN_OFFSETS} instead. */
const SINGLE_CARD_TILT = "rotate-3";

/**
 * Image variant for a ghost of `width` CSS pixels, assuming a 2× display. The
 * ghost is small, and the board's tiles are resizable, so this is picked per
 * drag rather than fixed — the tier board at its largest tile needs the 400w
 * that a 112px collection ghost would only waste.
 * @returns The variant to request.
 */
function variantFor(width: number): ImageVariant {
  if (width * 2 <= 120) {
    return "120w";
  }
  return width * 2 <= 240 ? "240w" : "400w";
}

/** Most cards a fan shows. Beyond this the count badge carries the number. */
const MAX_FAN = 3;

interface CardDragGhostProps {
  /**
   * What rides the cursor, front card first. Two or three fan out behind the
   * front one; more are dropped (the badge is what says how many there really
   * are). May be empty when nothing resolved — `card` then supplies the frame.
   */
  printings: readonly Printing[];
  /**
   * The dragged card, for the frame's rarity tint and orientation when
   * `printings` is empty or its art hasn't loaded. Redundant when a printing
   * resolved, since a `Printing` carries its own card.
   */
  card?: Card;
  /** Caption in the bar across the card's foot. Omitted, no bar is drawn. */
  label?: ReactNode;
  /** Badge in the top-right corner. Drawn only above 1, so a lone drag stays clean. */
  count?: number;
  /** Ghost width in pixels. Height follows the card aspect. */
  width?: number;
  className?: string;
}

/**
 * The card that rides the cursor during a drag — one component for every
 * card-dragging surface (collections, deck builder, tier board), so a ghost
 * looks the same wherever it was grabbed.
 *
 * Built on {@link CardArtThumb}, which is what keeps a battlefield's landscape
 * art, an art-less card's rarity watermark, and the proportional corner radius
 * consistent here without each surface re-deriving them. The frame is exactly
 * the card's aspect (rather than the taller fixed box these overlays used to
 * hardcode), so the label bar sits on the card's foot instead of floating below
 * it.
 *
 * What stays with the caller is the *arithmetic*: which printings to fan, what
 * the label reads, and what the count is. Those depend on selection state,
 * stack-trim modifiers and per-surface nouns, none of which belong here.
 *
 * @returns The drag ghost node.
 */
export function CardDragGhost({
  printings,
  card,
  label,
  count,
  width = CARD_DRAG_GHOST_WIDTH,
  className,
}: CardDragGhostProps) {
  const fan = printings.slice(0, MAX_FAN);
  // The proportional radius CardArtThumb rounds its frame by (5% of the width),
  // so the bar's bottom corners follow the card's rather than guessing at a
  // fixed one.
  const cornerRadius = width * 0.05;
  const height = width * CARD_ASPECT_INVERSE;

  // An empty fan still draws a frame: a card whose art is missing is dragged
  // like any other, and the placeholder is what shows the drag is alive.
  const frames = fan.length > 0 ? fan : [undefined];

  return (
    <div
      className={cn("relative", fan.length <= 1 && SINGLE_CARD_TILT, className)}
      style={{ width, height }}
    >
      {/* Painted back to front so the front card ends up on top, without
          relying on z-index against the label bar and badge below. */}
      {frames.toReversed().map((printing, reversedIndex) => {
        const index = frames.length - 1 - reversedIndex;
        const offset = FAN_OFFSETS[index] ?? FAN_OFFSETS[0];
        const frameCard = printing?.card ?? card;
        return (
          // The fan's placement lives on a wrapper: CardArtThumb sets its own
          // `style` for the proportional corner radius and takes no override.
          <span
            key={printing?.id ?? "placeholder"}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translate(${offset.x * width}px, ${offset.y * width}px) rotate(${offset.rotate}deg)`,
              zIndex: index,
            }}
          >
            <CardArtThumb
              imageId={frontImageId(printing)}
              variant={variantFor(width)}
              alt=""
              rarity={printing?.rarity}
              domains={frameCard?.domains}
              landscape={frameCard ? getOrientation(frameCard.types) === "landscape" : false}
              className="w-full shadow-lg"
            />
          </span>
        );
      })}
      {label !== undefined && (
        <div
          className="bg-background/80 absolute bottom-0 left-0 w-full px-1.5 py-1 backdrop-blur-sm"
          style={{
            zIndex: frames.length,
            borderBottomLeftRadius: cornerRadius,
            borderBottomRightRadius: cornerRadius,
          }}
        >
          <p className="truncate text-center text-xs font-medium">{label}</p>
        </div>
      )}
      {count !== undefined && count > 1 && (
        <div
          className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold shadow"
          style={{ zIndex: frames.length + 1 }}
        >
          {count}
        </div>
      )}
    </div>
  );
}
