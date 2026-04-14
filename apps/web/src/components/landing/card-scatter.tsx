import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

// [x%, y%, rotation°] — desktop uses an 8000×3000 landscape canvas,
// mobile uses a 1200×1800 portrait canvas.

// Desktop: core/mid/near remapped from the original 2800×1400 layout via
// newX = 50 + (oldX - 50) * 0.35, newY = 50 + (oldY - 50) * 0.467
// so they land in the same physical positions. Outer cards fill the rest.
const desktopCards = [
  // ── core ──
  [50, 31.3, 0], // Center Top
  [50, 68.7, 0], // Center Bottom
  [47.2, 63.1, -15],
  [52.8, 63.1, 15],
  [45.8, 35, 12],
  [54.2, 35, -12],
  [44.8, 54.7, -12],
  [55.2, 54.7, 12],
  [43, 44.4, -6],
  [57, 44.4, 6],

  // ── mid ──
  [40.2, 36.9, -22],
  [59.8, 36.9, 22],
  [38.8, 52.3, 14],
  [61.2, 52.3, -14],
  // ── near ──
  [35.3, 33.7, 15],
  [64.7, 33.7, -15],
  [34.6, 60.3, 8],
  [65.4, 60.3, -8],
  // ── outer (sparse) ──
  [30, 78, 12],
  [70, 78, -12],
  [28, 35, -20],
  [72, 35, 20],
  [25, 58, 10],
  [75, 58, -10],
  [22, 28, -15],
  [78, 28, 15],
  // ── far edges (very sparse) ──
  [20, 72, 6],
  [80, 72, -6],
  [12, 82, 16],
  [88, 82, -16],
  [12, 30, 18],
  [88, 30, -18],
  [3, 70, -8],
  [97, 70, 8],
  [0, 20, 6],
  [100, 20, -6],
] as const;

// Mobile: 4 cards on a 1200×1800 portrait canvas, scattered asymmetrically
// around the hero content. Subtle enough to discover by accident.
const mobileCards = [
  [40, 35, -14],
  [60, 36, 20],
  [40, 65, 14],
  [60, 66, -25],
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
    () => false,
  );
}

function CardShape({
  angle,
  active,
  hinting,
  shimmerDelay,
  imageUrl,
  onToggle,
}: {
  angle: number;
  active: boolean;
  hinting?: boolean;
  shimmerDelay: number;
  imageUrl?: string;
  onToggle: () => void;
}) {
  const [wobbling, setWobbling] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Handle cached images where onLoad may not fire
  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, [imageUrl]);

  function handleClick() {
    onToggle();
    setWobbling(true);
  }

  return (
    <button
      type="button"
      className={cn(
        "border-primary/10 hover:border-primary/40 dark:border-primary/15 dark:hover:border-primary/50 pointer-events-auto relative aspect-[5/7] w-14 -translate-x-1/2 -translate-y-1/2 cursor-pointer overflow-hidden rounded-lg border transition-[border-color] duration-300 md:w-16",
        !imageUrl && "bg-background",
        wobbling && "animate-wobble",
        hinting && "border-primary/40 dark:border-primary/50",
      )}
      style={{ rotate: `${angle}deg` }}
      onClick={handleClick}
      onAnimationEnd={() => setWobbling(false)}
    >
      {imageUrl && (
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          draggable={false}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full rounded-[inherit] object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
        />
      )}
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

/**
 * Fisher-Yates shuffle seeded by a numeric value so the result is
 * deterministic for the same seed + input, but varies across mounts.
 *
 * @returns A shuffled copy of `urls`, or an empty array if input is empty.
 */
function shuffleUrls(urls: string[], seed: number): string[] {
  if (urls.length === 0) {
    return [];
  }
  const result = [...urls];
  // Seeded PRNG (mulberry32) — bitwise ops intentionally coerce to int32
  let state = Math.trunc(seed * 2_654_435_761);
  for (let i = result.length - 1; i > 0; i--) {
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- int32 coercion required for PRNG
    state = (state + 0x6d_2b_79_f5) | 0;
    let temp = Math.imul(state ^ (state >>> 15), 1 | state);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), 61 | temp);
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- uint32 coercion required for PRNG
    const random = ((temp ^ (temp >>> 14)) >>> 0) / 4_294_967_296;
    const j = Math.floor(random * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function CardScatter({
  className,
  flyIn,
  hinting,
  imageUrls,
  onAllCollected,
}: {
  className?: string;
  flyIn?: boolean;
  hinting?: boolean;
  imageUrls?: string[];
  onAllCollected?: () => void;
}) {
  const hydrated = useHydrated();
  // Stable random seed per mount — useState initializer runs once, useHydrated
  // gates the shuffle so SSR renders plain shapes (no images yet).
  // oxlint-disable-next-line react/hook-use-state -- setter intentionally unused; seed is write-once
  const [seed] = useState(() => Math.random());
  const shuffled = hydrated ? shuffleUrls(imageUrls ?? [], seed) : [];
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
      // Blockers (e.g. glass panels) occlude scatter cards from the minigame
      // tally — cards mostly hidden behind a blocker are still rendered (so
      // they show through translucent panels) but excluded from reachable.
      const blockers = [...document.querySelectorAll("[data-card-blocker]")].map((b) =>
        b.getBoundingClientRect(),
      );
      const nextVisible = new Set<number>();
      let reachable = 0;
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
        const overlapX = Math.max(0, Math.min(rect.right, visRight) - Math.max(rect.left, visLeft));
        const overlapY = Math.max(0, Math.min(rect.bottom, visBottom) - Math.max(rect.top, visTop));
        const viewportArea = overlapX * overlapY;
        const totalArea = rect.width * rect.height;
        if (totalArea === 0) {
          continue;
        }
        // In viewport: render (fade in). Reachable: also not blocked.
        if (viewportArea / totalArea >= 0.5) {
          nextVisible.add(idx);
          let unblockedArea = viewportArea;
          for (const blocker of blockers) {
            const bx = Math.max(
              0,
              Math.min(rect.right, blocker.right) - Math.max(rect.left, blocker.left),
            );
            const by = Math.max(
              0,
              Math.min(rect.bottom, blocker.bottom) - Math.max(rect.top, blocker.top),
            );
            unblockedArea -= bx * by;
          }
          if (unblockedArea / totalArea >= 0.5) {
            reachable++;
          }
        }
      }
      setVisibleCards(nextVisible);
      setReachableCount(reachable + gone.size);
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
                imageUrl={shuffled.length > 0 ? shuffled[i % shuffled.length] : undefined}
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
