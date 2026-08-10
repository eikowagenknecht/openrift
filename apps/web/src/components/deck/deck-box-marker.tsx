import { BoxIcon } from "lucide-react";

import { useHomeCollection } from "@/hooks/use-home-collection";
import { cn } from "@/lib/utils";

/**
 * Names the collection a deck is stored in, for the deck tiles and list rows.
 * Plain text rather than a link — both surfaces are themselves links, and a
 * link inside a link is invalid markup. The deck page's hero chip is the
 * clickable version.
 * @returns The marker, or null for a deck with no box (or a viewer who can't
 *   resolve it).
 */
export function DeckBoxMarker({
  collectionId,
  className,
}: {
  collectionId?: string | null;
  className?: string;
}) {
  const box = useHomeCollection(collectionId);
  if (!box) {
    return null;
  }
  return (
    <span
      title={`Stored in ${box.name}`}
      className={cn(
        "text-muted-foreground/80 inline-flex min-w-0 items-center gap-1 text-xs",
        className,
      )}
    >
      <BoxIcon className="size-3 shrink-0" />
      <span className="truncate">{box.name}</span>
    </span>
  );
}
