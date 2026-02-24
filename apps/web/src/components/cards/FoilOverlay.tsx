import { cn } from "@/lib/utils";

interface FoilOverlayProps {
  active: boolean;
  shimmer?: boolean;
}

export function FoilOverlay({ active, shimmer }: FoilOverlayProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0",
        "bg-foil bg-[length:200%_200%]",
        "mix-blend-color-dodge",
        "transition-opacity duration-300",
        // 50% balances rainbow visibility without washing out card art
        active ? "opacity-50" : "opacity-0",
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
