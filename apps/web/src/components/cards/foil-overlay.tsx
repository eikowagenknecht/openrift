import { cn } from "@/lib/utils";

interface FoilOverlayProps {
  active: boolean;
  shimmer?: boolean;
  /** Reduce intensity for background/stacked cards */
  dim?: boolean;
}

export function FoilOverlay({ active, shimmer, dim }: FoilOverlayProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0",
        "bg-foil bg-[length:200%_200%]",
        "mix-blend-color-dodge",
        "transition-opacity duration-300",
        // 50% balances rainbow visibility without washing out card art; 25% for background cards
        active ? (dim ? "opacity-25" : "opacity-50") : "opacity-0",
        shimmer && active && "animate-foil-shimmer",
      )}
      style={
        shimmer
          ? undefined
          : {
              backgroundPosition: "var(--foil-bg-x, 50%) var(--foil-bg-y, 50%)",
            }
      }
    />
  );
}
