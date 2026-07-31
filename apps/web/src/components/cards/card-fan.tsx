import { imageUrl } from "@openrift/shared";
import type { CSSProperties, ComponentType, SVGProps } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { cn } from "@/lib/utils";

/** One fan slot: horizontal offset (px) and rotation (deg). */
interface FanSlot {
  x: number;
  r: number;
}

/** Per-size fan geometry: card width (px) and slot layouts indexed by fan size. */
interface FanSpec {
  cardWidth: number;
  layouts: readonly (readonly FanSlot[])[];
}

// The `sm` spec is the products-tile fan (bottom-anchored, up to four cards);
// `lg` is the event-hero fan (center-anchored, up to three larger cards with a
// heavier overlap, tuned separately rather than scaled from `sm`).
const FAN_SPECS: Record<"sm" | "lg", FanSpec> = {
  sm: {
    cardWidth: 92,
    layouts: [
      [],
      [{ x: 0, r: 0 }],
      [
        { x: -30, r: -6 },
        { x: 30, r: 6 },
      ],
      [
        { x: -52, r: -9 },
        { x: 0, r: 0 },
        { x: 52, r: 9 },
      ],
      [
        { x: -69, r: -12 },
        { x: -23, r: -4 },
        { x: 23, r: 4 },
        { x: 69, r: 12 },
      ],
    ],
  },
  lg: {
    cardWidth: 132,
    layouts: [
      [],
      [{ x: 0, r: 0 }],
      [
        { x: -44, r: -7 },
        { x: 44, r: 7 },
      ],
      [
        { x: -60, r: -9 },
        { x: 0, r: 0 },
        { x: 60, r: 9 },
      ],
    ],
  },
};

/** @returns The absolute-positioning classes for one fan card at `width`. */
function fanCardClass(anchor: "bottom" | "center"): string {
  return cn("aspect-card absolute left-1/2", anchor === "bottom" ? "bottom-[-14px]" : "top-1/2");
}

function fanCardStyle(
  slot: FanSlot,
  cardWidth: number,
  anchor: "bottom" | "center",
): CSSProperties {
  // The aspect-card ratio is 63/88, so the height is width * 88 / 63.
  const verticalCenter = anchor === "center" ? { marginTop: (-cardWidth * 88) / 63 / 2 } : {};
  return {
    width: cardWidth,
    marginLeft: -cardWidth / 2,
    ...verticalCenter,
    transform: `translateX(${slot.x}px) rotate(${slot.r}deg)`,
    transformOrigin: anchor === "bottom" ? "50% 120%" : "50% 90%",
  };
}

/** One fan cover: a self-hosted image id, or a direct `src` (demos, externals). */
type FanCover = { key: string } & ({ imageId: string } | { src: string });

/** @returns The img source attributes for one cover at the size's variant. */
function coverSources(
  cover: FanCover,
  cardWidth: number,
  variant: "240w" | "400w",
): { src: string; srcSet?: string; sizes?: string } {
  if ("src" in cover) {
    return { src: cover.src };
  }
  return {
    src: imageUrl(cover.imageId, variant),
    srcSet: `${imageUrl(cover.imageId, "120w")} 120w, ${imageUrl(cover.imageId, "240w")} 240w, ${imageUrl(cover.imageId, "400w")} 400w`,
    sizes: `${cardWidth}px`,
  };
}

interface CardFanProps {
  /** The art to fan, in display order; slots beyond the layout are ignored. */
  covers: readonly FanCover[];
  /** `sm` is the products-tile fan; `lg` the larger event-hero fan. */
  size?: "sm" | "lg";
  /** `bottom` bleeds off the band's bottom edge; `center` floats mid-band. */
  anchor?: "bottom" | "center";
  /**
   * Loads the fan eagerly at high fetch priority. Set it on the fans that are
   * above the fold (the first row of tiles) — a lazy fan there is the page's
   * LCP element and the lazy attribute delays it by a full round trip.
   */
  priority?: boolean;
}

/**
 * Up to four card images fanned like a physical spread, absolutely positioned
 * inside a `CoverBand` (or any relative host).
 *
 * @returns The fanned card images.
 */
export function CardFan({ covers, size = "sm", anchor = "bottom", priority }: CardFanProps) {
  const spec = FAN_SPECS[size];
  const layout = spec.layouts[Math.min(covers.length, spec.layouts.length - 1)];
  const variant = size === "lg" ? "400w" : "240w";
  return (
    <>
      {covers.slice(0, layout.length).map((cover, index) => (
        <ImgWithFallback
          key={cover.key}
          {...coverSources(cover, spec.cardWidth, variant)}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          className={cn("ring-foreground/20 object-cover shadow-md ring-1", fanCardClass(anchor))}
          style={{
            ...fanCardStyle(layout[index], spec.cardWidth, anchor),
            borderRadius: CARD_BORDER_RADIUS,
          }}
          fallback={null}
        />
      ))}
    </>
  );
}

/** Rotations for the outline fan: two dashed side cards behind an opaque center. */
const OUTLINE_ROTATIONS = [-12, 12, 0];

/**
 * The house empty-fan signature (see `EmptyCardFan` in
 * `components/empty-state.tsx`), sized for a `CoverBand`: two dashed side
 * cards splaying from a shared bottom origin behind an opaque center card, so
 * the outlines never overlap each other's dashes. The stand-in when there is
 * no art to show (imageless tiles, decks not yet submitted). An optional icon
 * sits in the center card, where it adds meaning without carrying the visual.
 *
 * @returns The absolutely-positioned outline elements (host must be relative).
 */
export function CardFanOutline({
  size = "sm",
  anchor = "bottom",
  icon: Icon,
}: {
  size?: "sm" | "lg";
  anchor?: "bottom" | "center";
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  const spec = FAN_SPECS[size];
  const stackedSlotStyle = (rotation: number): CSSProperties => ({
    ...fanCardStyle({ x: 0, r: rotation }, spec.cardWidth, anchor),
    // The house fan pivots at the cards' shared bottom edge, not the fan
    // arc's virtual center below it.
    transformOrigin: "50% 100%",
  });
  return (
    <>
      {OUTLINE_ROTATIONS.map((rotation) => (
        <div
          key={rotation}
          className={cn(
            "rounded-md border border-dashed",
            rotation === 0
              ? "border-muted-foreground/40 bg-card flex items-center justify-center"
              : "border-border",
            fanCardClass(anchor),
          )}
          style={stackedSlotStyle(rotation)}
        >
          {rotation === 0 && Icon ? (
            <Icon className="text-muted-foreground size-6 opacity-70" />
          ) : null}
        </div>
      ))}
    </>
  );
}
