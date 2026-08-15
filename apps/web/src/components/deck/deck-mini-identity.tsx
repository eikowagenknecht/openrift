import type { DeckListItemResponse } from "@openrift/shared";
import { imageUrl, legendDisplayName } from "@openrift/shared";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { DeckFormatText } from "@/components/deck/deck-format-badge";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { deckGlowStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * One card of the fanned pair. A slot with nothing to show keeps its outline,
 * so a deck missing its champion still reads as a deck rather than a lone
 * card that drifted left.
 * @returns The art, or its dashed placeholder.
 */
function FanSlot({
  imageId,
  alt,
  className,
}: {
  imageId?: string;
  alt: string;
  className?: string;
}) {
  if (!imageId) {
    return (
      <span
        aria-hidden
        style={{ borderRadius: CARD_BORDER_RADIUS }}
        className={cn(
          "aspect-card border-muted-foreground/25 absolute top-1/2 h-9 -translate-y-1/2 border border-dashed",
          className,
        )}
      />
    );
  }
  return (
    <img
      src={imageUrl(imageId, "120w")}
      alt={alt}
      draggable={false}
      style={{ borderRadius: CARD_BORDER_RADIUS }}
      className={cn(
        "aspect-card absolute top-1/2 h-9 -translate-y-1/2 object-cover shadow-sm",
        className,
      )}
    />
  );
}

/**
 * A deck at a glance: the fanned Legend/champion pair over the deck's domain
 * glow, the deck's name, and its format line. The deck sidebar's identity
 * header shrunk to fit a button or a menu row, for the surfaces that pick
 * between decks rather than open one.
 *
 * Built from spans so it can sit inside a button, and it reads its own hooks —
 * keep it to short lists (a variant family, a picker menu) rather than the
 * deck list, where the per-row subscriptions would add up.
 *
 * @returns The identity block.
 */
export function DeckMiniIdentity({
  item,
  className,
}: {
  item: DeckListItemResponse;
  className?: string;
}) {
  const domainColors = useDomainColors();
  const { getPreferredPrinting } = usePreferredPrinting();
  const legend = item.legendCardId ? getPreferredPrinting(item.legendCardId) : undefined;
  const champion = item.championCardId ? getPreferredPrinting(item.championCardId) : undefined;
  const legendName = legend
    ? legendDisplayName({
        name: legend.card.name,
        types: legend.card.types,
        tags: legend.card.tags,
      })
    : "Legend";

  return (
    <span
      className={cn("relative flex min-w-0 items-center gap-2.5 overflow-hidden p-2", className)}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={deckGlowStyle(legend?.card.domains ?? [], domainColors)}
      />
      <span className="relative block h-9 w-12 shrink-0">
        <FanSlot
          imageId={legend?.images.find((image) => image.face === "front")?.imageId}
          alt={legendName}
          className="left-0 -rotate-7"
        />
        <FanSlot
          imageId={champion?.images.find((image) => image.face === "front")?.imageId}
          alt={champion?.card.name ?? "Champion"}
          className="right-0 rotate-7"
        />
      </span>
      <span className="relative block min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.deck.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          <DeckFormatText
            format={item.deck.format}
            totalCards={item.totalCards}
            requiredProgress={item.requiredProgress}
            requiredTotal={item.requiredTotal}
            isValid={item.isValid}
          />
        </span>
      </span>
    </span>
  );
}
