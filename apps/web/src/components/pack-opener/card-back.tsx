import { useId } from "react";

import { cn } from "@/lib/utils";

interface CardBackProps {
  className?: string;
  /** True when the card is part of a "click to reveal" flow — adds hover affordance. */
  interactive?: boolean;
}

// Stylized card back used on the pack-opener simulator. Same aspect and corner
// radius as CardPlaceholderImage, with a centered logo on a noise-textured
// dark gradient. No card data, it hides what's underneath until flipped.
export function CardBack({ className, interactive = false }: CardBackProps) {
  const noiseId = useId();
  return (
    <div
      className={cn(
        "aspect-card @container relative overflow-hidden rounded-lg",
        "bg-gradient-to-br from-neutral-800 via-neutral-900 to-black",
        "ring-border ring-1",
        interactive && "transition-transform hover:scale-[1.02] hover:shadow-lg",
        className,
      )}
      role="img"
      aria-label="Card back"
    >
      <svg className="pointer-events-none absolute inset-0 size-full opacity-20" aria-hidden="true">
        <filter id={noiseId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="3"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${noiseId})`} />
      </svg>
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--color-primary) 0%, transparent 55%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="/logo.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none size-[45cqw] opacity-80 brightness-0 invert"
        />
      </div>
    </div>
  );
}
