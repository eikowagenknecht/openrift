import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// A warm glow rising from behind the band's content, so it reads as a
// display case rather than a flat gray strip.
const COVER_BAND_GLOW =
  "radial-gradient(120% 90% at 50% 115%, color-mix(in oklab, var(--border-accent) 22%, transparent), transparent 70%)";

/**
 * The visual band at the top of a showcase tile — a muted strip with a warm
 * glow behind whatever the tile displays (the product tiles' card fans, the
 * group tiles' member avatars). Size and content layout come from the caller;
 * the band only owns the backdrop.
 *
 * @returns The band element.
 */
export function CoverBand({ className, style, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("bg-muted relative shrink-0", className)}
      style={{ backgroundImage: COVER_BAND_GLOW, ...style }}
      {...props}
    />
  );
}
