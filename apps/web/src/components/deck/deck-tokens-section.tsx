import { WellKnown } from "@openrift/shared";
import { useState } from "react";

import {
  LANDSCAPE_THUMB_CLASS,
  LANDSCAPE_THUMB_STYLE,
  PORTRAIT_THUMB_CLASS,
  PORTRAIT_THUMB_STYLE,
} from "@/components/deck/deck-thumb-metrics";
import type { DeckTokenEntry } from "@/hooks/use-deck-tokens";
import { useDeckTokens } from "@/hooks/use-deck-tokens";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { cn } from "@/lib/utils";

/**
 * One token thumb. Read-only by design: a token is never a deck entry (rule
 * 133.7.c), so there is no count, no printing pin and nothing to drag.
 *
 * @returns The token's card image, or null once its image fails to load.
 */
function TokenThumb({
  entry,
  thumbnail,
}: {
  entry: DeckTokenEntry;
  thumbnail: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const isLandscape = entry.card.types.includes(WellKnown.cardType.BATTLEFIELD);

  if (!thumbnail || failed) {
    return null;
  }

  return (
    <div
      style={isLandscape ? LANDSCAPE_THUMB_STYLE : PORTRAIT_THUMB_STYLE}
      className={cn(
        "relative shrink-0 rounded-md",
        isLandscape ? LANDSCAPE_THUMB_CLASS : PORTRAIT_THUMB_CLASS,
      )}
      title={`${entry.card.name}, from ${entry.sourceNames.join(", ")}`}
    >
      <img
        src={thumbnail}
        alt={entry.card.name}
        className="h-full w-full rounded-md object-cover shadow-sm"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * The tokens a deck puts on the table, below its zones.
 *
 * Not a zone: tokens can't be deck entries, and `DeckZone` is a closed union
 * keyed as `Record<DeckZone, …>` in the validation, drag and codec paths. This
 * is a derived, read-only block instead, so none of that has to know about it.
 *
 * The thumbs don't open the detail pane: that pane walks the `CardViewerItem`
 * list `useDeckItems` builds from the deck's own entries, and a token is not
 * one. The hover title carries the name and which cards call for it.
 *
 * Suspends through `useDeckTokens`. The overview mounts it behind its hydration
 * gate inside a `Suspense` boundary.
 *
 * @returns The section, or null when the deck needs no tokens.
 */
export function DeckTokensSection({
  cards,
  getThumbnail,
}: {
  cards: DeckBuilderCard[];
  /** The overview's thumbnail resolver, so tokens use the same image pipeline. */
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
}) {
  const tokens = useDeckTokens(cards);

  if (tokens.length === 0) {
    return null;
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="font-medium">Tokens</h3>
        <span className="text-muted-foreground text-sm">
          Not part of the deck. Bring these to the table.
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((entry) => (
          <TokenThumb
            key={entry.card.slug}
            entry={entry}
            thumbnail={getThumbnail(entry.printing.cardId, entry.printing.id)}
          />
        ))}
      </div>
    </section>
  );
}
