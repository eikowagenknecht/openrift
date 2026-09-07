import { formatDay } from "@openrift/shared/format-date";
import { imageUrl } from "@openrift/shared/image-url";
import { legendDisplayName } from "@openrift/shared/utils";

import { usePreferredPrinting } from "@/features/cards/hooks/use-preferred-printing";
import { CARD_BORDER_RADIUS } from "@/features/cards/lib/card-grid-constants";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Deliberately not `DeckListItemResponse`: a browser-local deck and a pasted list must fit this shape too. */
export interface DeckIdentity {
  name: string;
  legendCardId?: string | null;
  championCardId?: string | null;
  cardCount?: number;
  /** ISO instant. */
  updatedAt?: string | null;
}

/** A slot with nothing to show keeps its dashed outline; it doesn't collapse. */
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
 * Built from spans so it can sit inside a button. Reads its own hooks, so
 * keep it to short lists (a variant family, a picker menu), not the deck list.
 */
export function DeckMiniIdentity({
  identity,
  className,
}: {
  identity: DeckIdentity;
  className?: string;
}) {
  const { getPreferredPrinting } = usePreferredPrinting();
  const legend = identity.legendCardId ? getPreferredPrinting(identity.legendCardId) : undefined;
  const champion = identity.championCardId
    ? getPreferredPrinting(identity.championCardId)
    : undefined;
  const domains = legend?.card.domains ?? [];
  const legendName = legend ? legendDisplayName(legend.card) : "Legend";

  return (
    <span className={cn("flex min-w-0 items-center gap-2.5 overflow-hidden p-2", className)}>
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
      <span className="block min-w-0 flex-1">
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
