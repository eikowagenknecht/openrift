import { cn } from "@/lib/utils";

interface FoilOverlayProps {
  active: boolean;
  shimmer?: boolean;
  /** Reduce intensity for background/stacked cards */
  dim?: boolean;
  /** Start animation paused; unpause on group hover (e.g. fan siblings) */
  paused?: boolean;
}

export function FoilOverlay({ active, shimmer, dim, paused }: FoilOverlayProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]",
        "mix-blend-color-dodge",
        "transition-opacity duration-300",
        // 50% balances rainbow visibility without washing out card art; 25% for background cards
        active ? (dim ? "opacity-25" : "opacity-50") : "opacity-0",
      )}
    >
      <div
        className={cn(
          "bg-foil absolute top-0 left-0 h-[200%] w-[200%]",
          shimmer && active && "animate-foil-shimmer",
          paused && "[animation-play-state:paused] group-hover:[animation-play-state:running]",
        )}
        style={
          shimmer
            ? undefined
            : {
                transform:
                  "translate3d(calc(var(--foil-bg-x, 50%) / -2), calc(var(--foil-bg-y, 50%) / -2), 0)",
              }
        }
      />
    </div>
  );
}
