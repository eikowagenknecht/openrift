import type { PrintingImage } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cardLinkVariants } from "@/components/ui/card-link";
import { cn } from "@/lib/utils";

export function metaFrontImage(imageId: string | null): PrintingImage | null {
  return imageId === null ? null : { face: "front", imageId };
}

// Any element taking its own clicks inside here must itself be positioned
// (not wrapped): a positioned wrapper is a full-width flex child and would
// cover the stretched permalink.
export function MetaDeckFrame({
  deck,
  label,
  className,
  children,
}: {
  deck: { shareToken: string };
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
