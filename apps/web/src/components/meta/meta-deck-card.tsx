import type { PrintingImage } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cardLinkVariants } from "@/components/ui/card-link";
import { cn } from "@/lib/utils";

/**
 * The archive's denormalized image ids as the fan's `PrintingImage` shape. The
 * summary carries the canonical front image directly, so the tile renders
 * server-side without a catalog lookup.
 * @returns The image, or null when the deck has no card in that zone.
 */
export function metaFrontImage(imageId: string | null): PrintingImage | null {
  return imageId === null ? null : { face: "front", imageId };
}

/**
 * The wrapper a deck tile sits in. Its target is the archive's permalink
 * (`/meta/decks/$token`), never the owner-scoped deck route.
 *
 * A positioned container rather than an anchor, with the permalink stretched
 * over it by its `::after`, so the tile can also carry a link to the legend's
 * archive page — an anchor inside an anchor is invalid, and a nested one is what
 * kept the legend unlinked here. Anything meant to take its own clicks must be
 * positioned, and the positioned element must be the anchor itself: a wrapper
 * around it is a full-width flex child, so it would sit over the permalink
 * across the whole card body while only the short name inside it led anywhere.
 */
export function MetaDeckFrame({
  deck,
  label,
  className,
  children,
}: {
  deck: { shareToken: string };
  /** What the stretched permalink announces, since it wraps no text of its own. */
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        cardLinkVariants(),
        "focus-within:ring-ring/50 ring-border group relative rounded-lg ring-1 focus-within:ring-2",
        className,
      )}
    >
      <Link
        to="/meta/decks/$token"
        params={{ token: deck.shareToken }}
        aria-label={label}
        className="rounded-lg outline-none after:absolute after:inset-0"
      />
      {children}
    </div>
  );
}
