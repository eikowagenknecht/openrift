import { Link } from "@tanstack/react-router";

import { cornerClip } from "@/features/marketing/components/clip-frame";
import { cn } from "@/lib/utils";

const CTA_CLIP = cornerClip(12);

export function HeroCtas({ className }: { className?: string }) {
  return (
    <div className={cn("my-3 flex flex-wrap items-center justify-center gap-3", className)}>
      <Link
        to="/cards"
        // ring-inset because the clip-path would cut off an outset focus ring.
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring font-heading inline-flex h-11 items-center px-7 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        style={{ clipPath: CTA_CLIP }}
      >
        Browse cards
      </Link>
      {/* clip-path clips the border off the diagonal edge, so the gold hairline
          is a clipped wrapper showing through 1px of padding. */}
      <span className="bg-border-accent inline-block p-px" style={{ clipPath: CTA_CLIP }}>
        <Link
          to="/signup"
          search={{ redirect: undefined, email: undefined }}
          className="bg-background hover:bg-secondary focus-visible:ring-ring font-heading inline-flex h-11 items-center px-7 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          style={{ clipPath: CTA_CLIP }}
        >
          Sign up free
        </Link>
      </span>
    </div>
  );
}
