import { useEffect, useRef, useState } from "react";

import { FoilOverlay } from "@/features/cards/components/foil-overlay";
import { useCardTilt } from "@/features/cards/hooks/use-card-tilt";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

// Must match the `animate-fly-away` CSS keyframe duration.
const FLY_AWAY_MS = 800;
const ALL_COLLECTED_DELAY_MS = 500;
const DEAL_STAGGER_MS = 70;
const SPREAD_DEG = 9;
const HOVER_SPREAD_DEG = 3;

const DESKTOP_COUNT = 5;
const MOBILE_COUNT = 3;

function FanCard({
  src,
  baseAngle,
  hovered,
  hinting,
  flyingAway,
  dealDelayMs,
  onHoverChange,
  onCollect,
}: {
  src: string;
  baseAngle: number;
  hovered: boolean;
  hinting?: boolean;
  flyingAway: boolean;
  dealDelayMs: number;
  onHoverChange: (hovered: boolean) => void;
  onCollect: () => void;
}) {
  const { containerRef, innerRef } = useCardTilt({ mode: "pointer", enabled: true });
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  const imgRef = useRef<HTMLImageElement>(null);

  // Cached images may not fire onLoad.
  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoadedSrc(src);
    }
  }, [src]);

  return (
    // Entrance/exit animations live here so they don't fight the fan-position
    // transform on the child below.
    <div
      className={cn(
        "absolute top-4 left-1/2 motion-reduce:animate-none",
        flyingAway ? "animate-fly-away" : "animate-fly-in",
      )}
      style={
        flyingAway
          ? undefined
          : {
              animationDelay: `${dealDelayMs}ms`,
              // Holds the 0% keyframe through the stagger delay so late cards
              // don't flash before dealing in.
              animationFillMode: "both",
            }
      }
    >
      <div
        className="w-40 transition-transform duration-300 ease-out sm:w-52 lg:w-60"
        style={{
          // Pivot below the card so one rotation gives both spread and droop.
          transformOrigin: "50% 135%",
          transform: `translateX(-50%) rotate(${baseAngle}deg)`,
        }}
      >
        {/* oxlint-disable-next-line react/forbid-elements -- decorative aria-hidden hit area, deliberately keyboard-excluded */}
        <button
          ref={containerRef}
          type="button"
          tabIndex={-1}
          className="group pointer-events-auto block w-full cursor-pointer"
          onPointerEnter={() => onHoverChange(true)}
          onPointerLeave={() => onHoverChange(false)}
          onClick={onCollect}
        >
          {/* Not on the button: the button is the pointer hit area, and
              lifting it would slide it out from under the pointer near the
              bottom edge, causing an enter/leave flicker loop. */}
          <div
            className={cn(
              "transition-transform duration-300 ease-out",
              hovered && "-translate-y-4 scale-105",
            )}
          >
            {/* overflow-hidden must live below the tilt, and can't share its
                element with preserve-3d (Firefox mis-sizes absolute
                descendants when both combine; see CardImage). */}
            <div
              ref={innerRef}
              style={{
                borderRadius: "5% / 3.6%",
                transform:
                  "perspective(1000px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
                transformStyle: "preserve-3d",
              }}
            >
              <div
                className={cn(
                  "border-primary/15 relative overflow-hidden border shadow-lg transition-[border-color] duration-300",
                  (hovered || hinting) && "border-primary/50",
                  !loaded && "bg-background",
                )}
                style={{ borderRadius: "inherit" }}
              >
                <div className="aspect-card" />
                <img
                  ref={imgRef}
                  src={src}
                  alt=""
                  draggable={false}
                  className={cn(
                    "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
                    loaded ? "opacity-100" : "opacity-0",
                  )}
                  onLoad={() => setLoadedSrc(src)}
                />
              </div>
              <FoilOverlay active={hovered || Boolean(hinting)} shimmer dim />
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

/** Hovering a card lifts and tilts it; clicking collects it, and `onAllCollected` fires once every card is gone. */
export function CardFan({
  imageUrls,
  hinting,
  onAllCollected,
  className,
}: {
  imageUrls: string[];
  hinting?: boolean;
  onAllCollected?: () => void;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const count = isMobile ? MOBILE_COUNT : DESKTOP_COUNT;
  const fanUrls = imageUrls.slice(0, count);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [flyingAway, setFlyingAway] = useState<Set<number>>(() => new Set());
  const [gone, setGone] = useState<Set<number>>(() => new Set());

  const [prevMobile, setPrevMobile] = useState(isMobile);
  if (prevMobile !== isMobile) {
    setPrevMobile(isMobile);
    setHoverIndex(null);
    setFlyingAway(new Set());
    setGone(new Set());
  }

  if (fanUrls.length === 0) {
    return null;
  }

  function collect(index: number) {
    if (gone.has(index)) {
      return;
    }
    setHoverIndex(null);
    setFlyingAway((prev) => new Set(prev).add(index));
    const nextGone = new Set(gone).add(index);
    setGone(nextGone);
    setTimeout(() => {
      setFlyingAway((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }, FLY_AWAY_MS);
    if (nextGone.size >= fanUrls.length) {
      setTimeout(() => onAllCollected?.(), FLY_AWAY_MS + ALL_COLLECTED_DELAY_MS);
    }
  }

  const centerOffset = (fanUrls.length - 1) / 2;

  return (
    <div
      className={cn(
        "pointer-events-none relative h-[280px] select-none sm:h-[360px] lg:h-[430px]",
        className,
      )}
      aria-hidden="true"
    >
      {fanUrls.map((url, index) => {
        if (gone.has(index) && !flyingAway.has(index)) {
          return null;
        }
        const step = index - centerOffset;
        const hoverLean =
          hoverIndex === null || hoverIndex === index
            ? 0
            : index < hoverIndex
              ? -HOVER_SPREAD_DEG
              : HOVER_SPREAD_DEG;
        return (
          <div
            key={url}
            className="absolute inset-0"
            // packages/e2e home.spec.ts locates cards by this index; the fan
            // has no role, name, or text a locator could otherwise use.
            data-fan-index={index}
            // Never raise the hovered card's z-index: it would cover the
            // neighbors' exposed strips and swallow their pointer events.
            style={{ zIndex: index }}
          >
            <FanCard
              src={url}
              baseAngle={step * SPREAD_DEG + hoverLean}
              hovered={hoverIndex === index}
              hinting={hinting}
              flyingAway={flyingAway.has(index)}
              dealDelayMs={index * DEAL_STAGGER_MS}
              onHoverChange={(hovered) => setHoverIndex(hovered ? index : null)}
              onCollect={() => collect(index)}
            />
          </div>
        );
      })}
    </div>
  );
}
