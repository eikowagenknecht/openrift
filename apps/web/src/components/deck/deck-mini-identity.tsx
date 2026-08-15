import { formatDay, imageUrl, legendDisplayName } from "@openrift/shared";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { deckGlowStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * A deck reduced to what it takes to recognise it in a picker. Deliberately
 * not `DeckListItemResponse`: a browser-local deck and a pasted list have to
 * fit this shape too.
 */
export interface DeckIdentity {
  name: string;
  /** Drives the left card of the fanned pair, and the deck's domain colors. */
  legendCardId?: string | null;
  /** Drives the right card of the pair. */
  championCardId?: string | null;
  /** Copies across every zone. */
  cardCount?: number;
  /** ISO instant of the deck's last change; shown as the day it happened. */
  updatedAt?: string | null;
}

/**
 * One card of the fanned pair. A slot with nothing to show keeps its outline,
 * so a deck missing its champion still reads as a deck rather than a lone card
 * that drifted left.
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
 * glow, the deck's name, and a line of the facts that tell two versions of one
 * deck apart — its domains, its size, and when it last changed. The deck
 * sidebar's identity header shrunk to fit a button or a menu row.
 *
 * Built from spans so it can sit inside a button, and it reads its own hooks —
 * keep it to short lists (a variant family, a picker menu) rather than the
 * deck list, where the per-row subscriptions would add up.
 *
 * @returns The identity block.
 */
export function DeckMiniIdentity({
  identity,
  className,
}: {
  identity: DeckIdentity;
  className?: string;
}) {
  const domainColors = useDomainColors();
  const { getPreferredPrinting } = usePreferredPrinting();
  const legend = identity.legendCardId ? getPreferredPrinting(identity.legendCardId) : undefined;
  const champion = identity.championCardId
    ? getPreferredPrinting(identity.championCardId)
    : undefined;
  const domains = legend?.card.domains ?? [];
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
      <span aria-hidden className="absolute inset-0" style={deckGlowStyle(domains, domainColors)} />
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
        <span className="block truncate text-sm font-medium">{identity.name}</span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          {domains.length > 0 && (
            <span aria-hidden className="flex shrink-0 items-center gap-0.5">
              {domains.map((domain) => {
                const icon = getFilterIconPath("domains", domain);
                return icon ? <img key={domain} src={icon} alt="" className="size-3.5" /> : null;
              })}
            </span>
          )}
          <span className="truncate tabular-nums">
            {identity.cardCount !== undefined && `${identity.cardCount} cards`}
            {identity.cardCount !== undefined && identity.updatedAt ? " · " : ""}
            {identity.updatedAt ? `Updated ${formatDay(identity.updatedAt)}` : ""}
          </span>
        </span>
      </span>
    </span>
  );
}
