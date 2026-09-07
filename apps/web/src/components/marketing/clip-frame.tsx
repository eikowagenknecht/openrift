import type { ReactNode } from "react";

import { OrnamentCorners } from "@/components/ui/ornament";
import { cn } from "@/lib/utils";

export function cornerClip(cut: number): string {
  return `polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%)`;
}

/**
 * Inner layer must stay opaque: a translucent value lets the wrapper color tint
 * the frame. No shadow: the clip would cut it.
 */
export function ClipFrame({
  children,
  className,
  wrapperClassName,
  cut = 16,
  tone = "accent",
  ornament = false,
}: {
  children: ReactNode;
  /** Must resolve to an opaque background. */
  className?: string;
  wrapperClassName?: string;
  cut?: number;
  tone?: "accent" | "border";
  /** Accent tone only. */
  ornament?: boolean;
}) {
  const clip = cornerClip(cut);
  return (
    <div
      className={cn(
        tone === "accent" ? "bg-border-accent" : "bg-border",
        "p-px",
        ornament && "relative",
        wrapperClassName,
      )}
      style={{ clipPath: clip }}
    >
      <div className={cn("bg-card p-4", className)} style={{ clipPath: clip }}>
        {children}
      </div>
      {ornament && <OrnamentCorners />}
    </div>
  );
}
