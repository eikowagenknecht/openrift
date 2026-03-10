import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// [x%, y%, rotation°] on an 8000×3000 canvas centered on the page.
// Core/mid/near are remapped from the original 2800×1400 layout via
// newX = 50 + (oldX - 50) * 0.35, newY = 50 + (oldY - 50) * 0.467
// so they land in the same physical positions. Outer cards fill the rest.
const cards = [
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

function CardShape({
  angle,
  active,
  shimmerDelay,
  onToggle,
}: {
  angle: number;
  active: boolean;
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
        "aspect-[5/7] w-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer pointer-events-auto rounded-lg border border-primary/10 bg-background transition-[border-color] duration-300 hover:border-primary/40 dark:border-primary/15 dark:hover:border-primary/50",
        wobbling && "animate-wobble",
      )}
      style={{ rotate: `${angle}deg` }}
      onClick={handleClick}
      onAnimationEnd={() => setWobbling(false)}
    >
      <div
        className={cn(
          "bg-foil absolute inset-0 animate-foil-shimmer rounded-[inherit] bg-[length:200%_200%] transition-opacity duration-700",
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
  onAllCollected,
}: {
  className?: string;
  flyIn?: boolean;
  onAllCollected?: () => void;
}) {
  const [activated, setActivated] = useState<Set<number>>(() => new Set());
  const [flyingAway, setFlyingAway] = useState<Set<number>>(() => new Set());
  const [gone, setGone] = useState<Set<number>>(() => new Set());
  const canvasRef = useRef<HTMLDivElement>(null);
  const [reachableCount, setReachableCount] = useState(0);
  const [flyingIn, setFlyingIn] = useState(flyIn ?? false);

  useEffect(() => {
    function countVisible() {
      const el = canvasRef.current;
      if (!el) {
        return;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let count = 0;
      for (const child of el.children) {
        const rect = child.getBoundingClientRect();
        const overlapX = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
        const overlapY = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
        const visibleArea = overlapX * overlapY;
        const totalArea = rect.width * rect.height;
        if (totalArea > 0 && visibleArea / totalArea >= 0.5) {
          count++;
        }
      }
      // Add back collected cards — they're gone from the DOM but were reachable
      count += gone.size;
      setReachableCount(count);
    }
    countVisible();
    window.addEventListener("resize", countVisible);
    return () => window.removeEventListener("resize", countVisible);
  }, [gone.size]);

  function toggle(index: number) {
    const wasActive = activated.has(index);
    if (wasActive) {
      setActivated((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setFlyingAway((p) => new Set(p).add(index));
      setTimeout(() => {
        setGone((p) => {
          const next = new Set(p).add(index);
          // Check if all reachable cards are now collected
          if (reachableCount > 0 && next.size >= reachableCount) {
            setTimeout(() => onAllCollected?.(), 500);
          }
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
      className={cn("pointer-events-none absolute inset-0 select-none", className)}
      aria-hidden="true"
    >
      {/* Large canvas centered — dense core, fades toward edges */}
      <div
        ref={canvasRef}
        className="absolute left-1/2 top-1/2 h-[3000px] w-[8000px] -translate-x-1/2 -translate-y-1/2"
      >
        {cards.map(([x, y, angle], i) =>
          gone.has(i) ? null : (
            <div
              key={`${x}-${y}`}
              className={cn(
                "absolute",
                flyingAway.has(i) && "animate-fly-away",
                flyingIn && "animate-fly-in",
              )}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                ...(flyingIn
                  ? { animationDelay: `${i * 30}ms`, opacity: 0, transform: "scale(0)" }
                  : undefined),
              }}
              onAnimationEnd={
                flyingIn && i === cards.length - 1 ? () => setFlyingIn(false) : undefined
              }
            >
              <CardShape
                angle={angle}
                active={activated.has(i)}
                shimmerDelay={((x * 7 + y * 13) % 40) / 10}
                onToggle={() => toggle(i)}
              />
            </div>
          ),
        )}
      </div>

      {collected > 0 && reachableCount > 0 && (
        <div className="pointer-events-auto fixed top-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-primary/20 bg-background/80 px-4 py-1.5 text-xs tabular-nums text-muted-foreground backdrop-blur-sm">
          {collected} / {reachableCount} collected
        </div>
      )}
    </div>
  );
}
