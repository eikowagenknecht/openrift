import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The app's shape signature: a 45° cut off the bottom-right corner. */
export function cornerClip(cut: number): string {
  return `polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%)`;
}

/**
 * Hairline-framed surface with the corner cut. clip-path slices a normal
 * border off the diagonal edge, so the hairline is a clipped wrapper showing
 * through 1px of padding. The inner layer must stay OPAQUE: any translucency
 * lets the wrapper color tint the whole frame instead of reading as a 1px
 * line. No shadow: the clip would cut it.
 */
export function ClipFrame({
  children,
  className,
  wrapperClassName,
  cut = 16,
  tone = "accent",
}: {
  children: ReactNode;
  /** Classes for the inner (content) layer. Must resolve to an opaque background. */
  className?: string;
  wrapperClassName?: string;
  /** Corner cut in px: 16 on frames, 12 on small tiles and CTAs. */
  cut?: number;
  /** Hairline color: gold accent for showpieces, plain border for quiet tiles. */
  tone?: "accent" | "border";
}) {
  const clip = cornerClip(cut);
  return (
    <div
      className={cn(tone === "accent" ? "bg-border-accent" : "bg-border", "p-px", wrapperClassName)}
      style={{ clipPath: clip }}
    >
      <div className={cn("bg-card p-4", className)} style={{ clipPath: clip }}>
        {children}
      </div>
    </div>
  );
}
