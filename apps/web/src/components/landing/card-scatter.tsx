import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

// [x%, y%, rotation°] — desktop uses an 8000×3000 landscape canvas,
// mobile uses a 1200×1800 portrait canvas.

// Desktop: core/mid/near remapped from the original 2800×1400 layout via
// newX = 50 + (oldX - 50) * 0.35, newY = 50 + (oldY - 50) * 0.467
// so they land in the same physical positions. Outer cards fill the rest.
const desktopCards = [
  // ── core ──
  [45.8, 35.1, 12],
  [54.2, 34.1, -8],
  [43, 44.4, -6],
  [57, 42.5, 10],
  [44.8, 54.7, -14],
  [55.3, 53.7, 8],
  [47.2, 63.1, -10],
  [52.8, 64, 16],
  [50, 31.3, 5],
  [50, 68.7, -5],
  // ── mid ──
  [40.2, 36.9, -22],
  [59.8, 36, 18],
  [38.8, 52.3, 14],
  [61.2, 50.9, -20],
  [42.3, 64, -10],
  [57.7, 64.9, 22],
  // ── near ──
  [35.3, 33.7, 15],
  [64.7, 40.7, -12],
  [34.6, 60.3, 8],
  [65.4, 63.1, -16],
  // ── outer (sparse) ──
  [28, 38, -20],
  [72, 42, 14],
  [25, 58, 10],
  [75, 55, -8],
  [22, 28, -15],
  [78, 30, 22],
  [20, 72, 6],
  [80, 68, -18],
  [30, 78, 12],
  [70, 22, -10],
  // ── far edges (very sparse) ──
  [12, 35, 18],
  [88, 60, -14],
  [8, 70, -8],
  [92, 40, 10],
  [14, 82, 16],
  [86, 18, -22],
  [5, 50, 6],
  [95, 50, -12],
] as const;

// Mobile: 4 cards on a 1200×1800 portrait canvas, scattered asymmetrically
// around the hero content. Subtle enough to discover by accident.
const mobileCards = [
  [38, 31, -14],
  [63, 37, 8],
  [35, 64, 12],
  [60, 69, -6],
] as const;

const mobileQuery =
  typeof globalThis.matchMedia === "function" ? globalThis.matchMedia("(max-width: 767px)") : null;

function useIsMobile() {
  return useSyncExternalStore(
    (subscribe) => {
      mobileQuery?.addEventListener("change", subscribe);
      return () => mobileQuery?.removeEventListener("change", subscribe);
    },
    () => mobileQuery?.matches ?? false,
  );
}

function CardShape({
  angle,
  active,
  hinting,
  shimmerDelay,
  onToggle,
}: {
  angle: number;
  active: boolean;
  hinting?: boolean;
  shimmerDelay: number;
  onToggle: () => void;
}) {
  const [wobbling, setWobbling] = useState(false);

  function handleClick() {
    onToggle();
    setWobbling(true);
  }

  return (
    <button
      type="button"
      className={cn(
        "border-primary/10 bg-background hover:border-primary/40 dark:border-primary/15 dark:hover:border-primary/50 pointer-events-auto aspect-[5/7] w-14 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-lg border transition-[border-color] duration-300 md:w-16",
        wobbling && "animate-wobble",
        hinting && "border-primary/40 dark:border-primary/50",
      )}
      style={{ rotate: `${angle}deg` }}
      onClick={handleClick}
      onAnimationEnd={() => setWobbling(false)}
    >
      <div
        className={cn(
          "bg-foil animate-foil-shimmer absolute inset-0 rounded-[inherit] bg-[length:200%_200%] transition-opacity duration-700",
          active ? "opacity-30" : "opacity-0",
        )}
        style={{ animationDelay: `${shimmerDelay}s` }}
      />
    </button>
  );
}

export function CardScatter({
  className,
  flyIn,
  hinting,
  onAllCollected,
}: {
  className?: string;
  flyIn?: boolean;
  hinting?: boolean;
  onAllCollected?: () => void;
}) {
  const [activated, setActivated] = useState<Set<number>>(() => new Set());
  const [flyingAway, setFlyingAway] = useState<Set<number>>(() => new Set());
  const [gone, setGone] = useState<Set<number>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [reachableCount, setReachableCount] = useState(0);
  const [flyingIn, setFlyingIn] = useState(flyIn ?? false);
  const [visibleCards, setVisibleCards] = useState<Set<number>>(() => new Set());
  const isMobile = useIsMobile();
  const activeCards = isMobile ? mobileCards : desktopCards;

  // Reset collection state when switching between mobile/desktop card sets
  const prevMobileRef = useRef(isMobile);
  if (prevMobileRef.current !== isMobile) {
    prevMobileRef.current = isMobile;
    setActivated(new Set());
    setFlyingAway(new Set());
    setGone(new Set());
    // visibleCards and reachableCount are recomputed by the layout effect
  }

  useLayoutEffect(() => {
    function countVisible() {
      const el = canvasRef.current;
      const container = containerRef.current;
      if (!el || !container) {
        return;
      }
      // Intersect viewport with the overflow-hidden container so cards
      // clipped behind the footer aren't counted as visible.
      const cb = container.getBoundingClientRect();
      const visLeft = Math.max(cb.left, 0);
      const visTop = Math.max(cb.top, 0);
      const visRight = Math.min(cb.right, window.innerWidth);
      const visBottom = Math.min(cb.bottom, window.innerHeight);
      const nextVisible = new Set<number>();
      for (const child of el.children) {
        const idx = Number((child as HTMLElement).dataset.cardIndex);
        if (Number.isNaN(idx) || gone.has(idx)) {
          continue;
        }
        // Use the button (firstElementChild) — it has the -translate-x/y
        // centering transform, so its rect reflects the actual visual position.
        const rect = (child.firstElementChild ?? child).getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          continue;
        }
        // Show cards that are at least 50% within the visible area
        const overlapX = Math.max(0, Math.min(rect.right, visRight) - Math.max(rect.left, visLeft));
        const overlapY = Math.max(0, Math.min(rect.bottom, visBottom) - Math.max(rect.top, visTop));
        const visibleArea = overlapX * overlapY;
        const totalArea = rect.width * rect.height;
        if (totalArea > 0 && visibleArea / totalArea >= 0.5) {
          nextVisible.add(idx);
        }
      }
      setVisibleCards(nextVisible);
      setReachableCount(nextVisible.size + gone.size);
    }
    countVisible();
    // Re-check periodically so drifting cards fade in/out at edges.
    const interval = setInterval(countVisible, 2000);
    window.addEventListener("resize", countVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", countVisible);
    };
    // Re-count when flyingIn ends — during fly-in, cards are at scale(0)
    // so their bounding rects are empty and countVisible would return 0.
    // Also re-count on mobile/desktop switch for the new card set.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- gone.size is intentional; we only re-run when the count changes, not on every Set reference
  }, [gone.size, flyingIn, isMobile]);

  // Trigger completion when collected count reaches reachable count,
  // whether from collecting a card or from reachable count decreasing (drift/resize).
  useEffect(() => {
    if (reachableCount > 0 && gone.size >= reachableCount) {
      const timeout = setTimeout(() => onAllCollected?.(), 500);
      return () => clearTimeout(timeout);
    }
  }, [reachableCount, gone.size, onAllCollected]);

  function toggle(index: number) {
    const wasActive = activated.has(index);
    if (wasActive) {
      setActivated((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setFlyingAway((p) => new Set(p).add(index));
      setGone((p) => new Set(p).add(index));
      // Remove from flyingAway after animation ends so card is removed from DOM
      setTimeout(() => {
        setFlyingAway((p) => {
          const next = new Set(p);
          next.delete(index);
          return next;
        });
      }, 800);
    } else {
      setActivated((prev) => new Set(prev).add(index));
    }
  }

  const collected = gone.size;

  return (
    <div
      ref={containerRef}
      className={cn("pointer-events-none absolute inset-0 select-none", className)}
      aria-hidden="true"
    >
      {/* Canvas centered — landscape on desktop, portrait on mobile */}
      <div
        ref={canvasRef}
        className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          isMobile ? "h-[1800px] w-[1200px]" : "h-[3000px] w-[8000px]",
        )}
      >
        {activeCards.map(([x, y, angle], i) =>
          gone.has(i) && !flyingAway.has(i) ? null : (
            <div
              key={`${x}-${y}`}
              data-card-index={i}
              className={cn(
                "absolute",
                flyingAway.has(i) && "animate-fly-away",
                flyingIn && "animate-fly-in",
                !flyingIn &&
                  !flyingAway.has(i) &&
                  !gone.has(i) &&
                  "animate-drift transition-opacity duration-300",
                !flyingIn &&
                  !flyingAway.has(i) &&
                  !gone.has(i) &&
                  !visibleCards.has(i) &&
                  "pointer-events-none opacity-0",
              )}
              style={
                {
                  left: `${x}%`,
                  top: `${y}%`,
                  "--drift-duration": `${10 + ((x * 7 + y * 3) % 10)}s`,
                  "--drift-delay": `-${(x * 3 + y * 11) % 14}s`,
                  ...(flyingIn
                    ? { animationDelay: `${i * 30}ms`, opacity: 0, transform: "scale(0)" }
                    : undefined),
                } as React.CSSProperties
              }
              onAnimationEnd={
                flyingIn && i === activeCards.length - 1 ? () => setFlyingIn(false) : undefined
              }
            >
              <CardShape
                angle={angle}
                active={activated.has(i)}
                hinting={hinting}
                shimmerDelay={((x * 7 + y * 13) % 40) / 10}
                onToggle={() => toggle(i)}
              />
            </div>
          ),
        )}
      </div>

      {collected > 0 && reachableCount > 0 && (
        <div className="border-primary/20 bg-background/80 text-muted-foreground pointer-events-auto fixed top-4 left-1/2 z-20 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs tabular-nums backdrop-blur-sm">
          {collected} / {reachableCount} collected
        </div>
      )}
    </div>
  );
}
