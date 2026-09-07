import { imageUrl } from "@openrift/shared";
import type { CSSProperties, ComponentType, SVGProps } from "react";

import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { CARD_BORDER_RADIUS } from "@/lib/card-grid-constants";
import { cn } from "@/lib/utils";

/** One fan slot: x/y offset (px), rotation (deg), and an optional paint-order z. */
interface FanSlot {
  x: number;
  r: number;
  y?: number;
  z?: number;
}

type FanSize = "xs" | "sm" | "lg";

interface FanSpec {
  cardWidth: number;
  layouts: readonly (readonly FanSlot[])[];
}

const FAN_SPECS: Record<FanSize, FanSpec> = {
  xs: {
    cardWidth: 64,
    layouts: [
      [],
      [{ x: 0, r: 0 }],
      [
        { x: 5, r: 4, z: 2 },
        { x: -18, y: 6, r: -8, z: 1 },
      ],
      [
        { x: 0, r: 0, z: 2 },
        { x: -25, y: 7, r: -9, z: 1 },
        { x: 25, y: 7, r: 9, z: 1 },
      ],
    ],
  },
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
    zIndex: slot.z,
    marginLeft: -cardWidth / 2,
    ...verticalCenter,
    transform: `translate(${slot.x}px, ${slot.y ?? 0}px) rotate(${slot.r}deg)`,
    transformOrigin: anchor === "bottom" ? "50% 120%" : "50% 90%",
  };
}

/** A self-hosted image id, or a direct `src` for demos and external art. */
type FanCover = { key: string } & ({ imageId: string } | { src: string });

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
  covers: readonly FanCover[];
  /** `xs` is the archive's podium fan, `sm` the products tile, `lg` the event hero. */
  size?: FanSize;
  anchor?: "bottom" | "center";
  /** Set on above-the-fold fans: this is the page's LCP element, lazy loading it costs a round trip. */
  priority?: boolean;
}

/**
 * Up to four card images fanned like a physical spread, absolutely positioned
 * inside a `CoverBand` (or any relative host).
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

const OUTLINE_ROTATIONS = [-12, 12, 0];

/**
 * The house empty-fan signature (see `EmptyCardFan` in
 * `components/empty-state.tsx`), sized for a `CoverBand`. Stand-in for when
 * there is no art to show (imageless tiles, decks not yet submitted).
 */
export function CardFanOutline({
  size = "sm",
  anchor = "bottom",
  icon: Icon,
}: {
  size?: FanSize;
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
