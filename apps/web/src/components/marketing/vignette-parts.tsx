import type { ReactNode } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

/**
 * Pieces shared by the marketing miniatures. Everything here mirrors a real
 * app primitive that cannot be imported directly (see the dossier's list of
 * modules that drag in filter stores, recharts or data hooks).
 */

export function Vignette({ children, className }: { children: ReactNode; className?: string }) {
  return <ClipFrame className={cn("flex flex-col gap-4 p-5", className)}>{children}</ClipFrame>;
}

export function VignetteHeading({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground text-xs font-medium">{children}</span>;
}

/**
 * Two states of the same element, stacked in one grid cell and crossfaded on
 * the shared 9s vignette cycle. The `now` layer is the base state, so reduced
 * motion (and the server render) shows the finished miniature.
 */
export function Swap({
  was,
  now,
  className,
}: {
  was: ReactNode;
  now: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-grid justify-items-start", className)}>
      <span className="motion-safe:animate-vignette-was col-start-1 row-start-1 opacity-0">
        {was}
      </span>
      <span className="motion-safe:animate-vignette-now col-start-1 row-start-1">{now}</span>
    </span>
  );
}

// The card edge in the app is a 1px inset ::after over a percentage elliptical
// radius, never a border on the <img> — copied from AFTER_BORDER rather than
// imported, because card-thumbnail.tsx pulls the whole thumbnail stack.
const CARD_EDGE =
  "after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:border after:border-[var(--border-opaque)]";

export function MiniCardArt({ url, className }: { url: string; className?: string }) {
  return (
    <span
      className={cn("relative block", CARD_EDGE, className)}
      style={{ borderRadius: CARD_BORDER_RADIUS }}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        draggable={false}
        className="aspect-card block w-full rounded-[inherit] object-cover"
      />
    </span>
  );
}

/** The white circular energy glyph from DeckCardRow. */
export function EnergyGlyph({ energy }: { energy: number }) {
  return (
    <span
      role="img"
      aria-label={`Energy ${energy}`}
      className="text-2xs flex size-4 shrink-0 items-center justify-center rounded-full bg-white leading-none font-bold text-[#013951]"
    >
      {energy}
    </span>
  );
}

/** One domain rune per point of power, like PowerPips in DeckCardRow. */
export function PowerPips({ power, domain }: { power: number; domain: string }) {
  if (power <= 0) {
    return null;
  }
  return (
    <span role="img" aria-label={`Power ${power}`} className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: power }, (_, index) => (
        <img key={index} src={`/images/domains/${domain}.webp`} alt="" className="inline size-3" />
      ))}
    </span>
  );
}

/**
 * A ghost strip icon button that is not a button: the miniatures sit inside a
 * link on the landing page, so nothing in them may be interactive.
 */
export function StripGlyph({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="text-muted-foreground flex size-5 items-center justify-center rounded-md text-xs"
    >
      {children}
    </span>
  );
}
