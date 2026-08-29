import { WellKnown, getOrientation, imageUrl } from "@openrift/shared";
import { ImageOffIcon, InfoIcon } from "lucide-react";
import { useState } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { CardMiniRow } from "@/components/cards/card-mini-row";
import { AFTER_BORDER } from "@/components/cards/card-thumbnail";
import { DECK_LIST_SECTION_CLASS } from "@/components/deck/deck-overview-list";
import {
  LANDSCAPE_THUMB_CLASS,
  LANDSCAPE_THUMB_STYLE,
  PORTRAIT_THUMB_CLASS,
  PORTRAIT_THUMB_STYLE,
} from "@/components/deck/deck-thumb-metrics";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckItems } from "@/hooks/use-deck-items";
import type { DeckTokenEntry } from "@/hooks/use-deck-tokens";
import { useDeckTokens } from "@/hooks/use-deck-tokens";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import type { HoverHandler } from "@/lib/card-row-interactions";
import { rowActivateProps } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { cn } from "@/lib/utils";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useSelectionStore } from "@/stores/selection-store";

/** Section label, matching the zone labels' small-caps grammar. */
const TOKENS_LABEL = "Tokens";
/** States what the band is, without telling the player what to do about it. */
const TOKENS_HINT = "Created by cards in this deck. Not part of the deck itself.";

/**
 * The front-face art of the printing a token entry stands for. Resolved from
 * the entry itself rather than the host's thumbnail resolver: the share page
 * builds that map from the deck's own cards, so a token would never be in it.
 *
 * @returns The image URL at that size, or undefined when the printing has no front art.
 */
function tokenImageUrl(entry: DeckTokenEntry, size: "120w" | "400w"): string | undefined {
  const front = entry.printing.images.find((image) => image.face === "front");
  return front ? imageUrl(front.imageId, size) : undefined;
}

/**
 * Who asks for this token, as the hover title both layouts carry.
 *
 * @returns The token's name and the deck cards that create it.
 */
function tokenTitle(entry: DeckTokenEntry): string {
  return `${entry.card.name}, from ${entry.sourceNames.join(", ")}`;
}

/**
 * The header's info affordance. The zone headers carry no description, so the
 * not-a-zone caveat sits in a tooltip instead of a second line, which would be
 * the one thing making this band look unlike the zones above it.
 *
 * @returns The info icon with its tooltip.
 */
function TokensHint() {
  return (
    <Tooltip>
      <TooltipTrigger className="text-muted-foreground/70 hover:text-foreground flex shrink-0 items-center transition-colors">
        <InfoIcon className="size-3.5" />
        <span className="sr-only">{TOKENS_HINT}</span>
      </TooltipTrigger>
      <TooltipContent>{TOKENS_HINT}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One token thumb, at the same size and with the same chrome as a zone thumb.
 * Read-only by design: a token is never a deck entry (rule 133.7.c), so there
 * is no count, no printing pin and nothing to drag — but clicking opens the
 * detail exactly like a deck card does.
 *
 * @returns The token's card image, or a name card once its image fails to load.
 */
function TokenThumb({
  entry,
  onSelect,
  onHoverCard,
}: {
  entry: DeckTokenEntry;
  onSelect: () => void;
  onHoverCard?: HoverHandler;
}) {
  const thumbnail = tokenImageUrl(entry, "400w");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showFallback = !thumbnail || thumbnail === failedUrl;
  const isLandscape = entry.card.types.includes(WellKnown.cardType.BATTLEFIELD);
  // Tokens are the overview's only zone-less items, so a null selected zone
  // with a matching printing is this thumb and nothing else.
  const isSelected = useSelectionStore(
    (state) => state.selectedZone === null && state.selectedCard?.id === entry.printing.id,
  );

  return (
    <div
      {...rowActivateProps(onSelect)}
      onMouseEnter={() => onHoverCard?.(entry.printing.cardId, entry.printing.id)}
      onMouseLeave={() => onHoverCard?.(null)}
      title={tokenTitle(entry)}
      style={{
        ...(isLandscape ? LANDSCAPE_THUMB_STYLE : PORTRAIT_THUMB_STYLE),
        borderRadius: CARD_BORDER_RADIUS,
      }}
      className={cn(
        "relative shrink-0 cursor-pointer",
        !showFallback && AFTER_BORDER,
        isLandscape ? LANDSCAPE_THUMB_CLASS : PORTRAIT_THUMB_CLASS,
        isSelected && "ring-primary ring-offset-background ring-2 ring-offset-2",
      )}
    >
      {showFallback ? (
        // The zone thumbs' name card, to the letter: a token with no art on
        // file degrades exactly the way a deck card does.
        <div className="border-muted-foreground/25 bg-muted/30 flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-[inherit] border border-dashed p-2 text-center">
          <ImageOffIcon aria-hidden="true" className="text-muted-foreground/70 size-5 shrink-0" />
          <span className="text-muted-foreground line-clamp-3 text-xs">{entry.card.name}</span>
        </div>
      ) : (
        <img
          src={thumbnail}
          alt={entry.card.name}
          className="h-full w-full rounded-[inherit] object-cover shadow-sm"
          draggable={false}
          onError={() => setFailedUrl(thumbnail)}
        />
      )}
    </div>
  );
}

/**
 * One token as a list row, built on the same grammar as the deck list's rows:
 * art strip, domain pip, rarity + short code, name. The quantity slot stays
 * empty rather than reading "1×" — a token has no copy count — and the cards
 * that ask for it fill the space the price and ownership columns leave.
 *
 * @returns The row element.
 */
function TokenRow({
  entry,
  domainColors,
  rarityLabels,
  onSelect,
  onHoverCard,
}: {
  entry: DeckTokenEntry;
  domainColors: Record<string, string>;
  rarityLabels: Record<string, string>;
  onSelect: () => void;
  onHoverCard?: HoverHandler;
}) {
  return (
    <div
      {...rowActivateProps(onSelect)}
      onMouseEnter={() => onHoverCard?.(entry.printing.cardId, entry.printing.id)}
      onMouseLeave={() => onHoverCard?.(null)}
      title={tokenTitle(entry)}
      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
    >
      <CardMiniRow
        className="self-stretch"
        src={tokenImageUrl(entry, "120w")}
        landscape={getOrientation(entry.card.types) === "landscape"}
        domains={entry.card.domains}
        domainColors={domainColors}
        rarity={entry.printing.rarity}
        rarityLabels={rarityLabels}
        shortCode={entry.printing.shortCode}
        loading="lazy"
        hideMetaOnMobile
      />

      {/* Keeps the names on the same x as the zones' rows, which spend this
          slot on the copy count. */}
      <span aria-hidden className="w-6 shrink-0" />

      <span className="min-w-0 flex-1 truncate">{entry.card.name}</span>

      <span className="text-muted-foreground min-w-0 shrink truncate text-xs">
        from {entry.sourceNames.join(", ")}
      </span>
    </div>
  );
}

/**
 * The tokens a deck puts on the table, rendered as one more band of the
 * overview — a zone-shaped header over thumbs in the grid views, a zone-shaped
 * section of rows in the list view.
 *
 * Not a zone, though: tokens can't be deck entries, and `DeckZone` is a closed
 * union keyed as `Record<DeckZone, …>` in the validation, drag and codec paths.
 * This is a derived, read-only block instead, so none of that has to know about
 * it. What it does share is the fold state (the UI store's collapsed set takes
 * a `"tokens"` key) and the detail overlay: `useDeckItems` appends the tokens
 * after the zones, so a click selects one and prev/next walks into them.
 *
 * Suspends through `useDeckTokens`. Both hosts mount it behind their hydration
 * gate inside a `Suspense` boundary.
 *
 * @returns The section, or null when the deck needs no tokens.
 */
export function DeckTokensSection({
  cards,
  variant,
  onHoverCard,
}: {
  cards: DeckBuilderCard[];
  /** Which overview mode is showing — the band matches its surroundings. */
  variant: "grid" | "list";
  onHoverCard?: HoverHandler;
}) {
  const tokens = useDeckTokens(cards);
  // The same list the host hands its detail pane, so the index a click sets
  // lines up with the pane's prev/next.
  const { items } = useDeckItems(cards);
  const collapsed = useDeckBuilderUiStore((state) => state.collapsedZones.has("tokens"));
  const toggleCollapsed = useDeckBuilderUiStore((state) => state.toggleZoneCollapsed);
  const { labels } = useEnumOrders();
  const domainColors = useDomainColors();

  if (tokens.length === 0) {
    return null;
  }

  const selectToken = (entry: DeckTokenEntry) => {
    useSelectionStore.getState().selectCard(entry.printing, items, "printing");
  };

  const count = (
    <span className="text-muted-foreground ml-auto text-xs tabular-nums">{tokens.length}</span>
  );

  if (variant === "list") {
    return (
      <section className={DECK_LIST_SECTION_CLASS}>
        <div className="flex h-6 items-center gap-2 border-b">
          <h3 className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
            {TOKENS_LABEL}
          </h3>
          <TokensHint />
          {count}
        </div>
        <div className="flex flex-col gap-0.5">
          {tokens.map((entry) => (
            <TokenRow
              key={entry.card.slug}
              entry={entry}
              domainColors={domainColors}
              rarityLabels={labels.rarities}
              onSelect={() => selectToken(entry)}
              onHoverCard={onHoverCard}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      {/* Same fixed-height header row as a zone tile, so the band's rule lines
          up with the zones' above it. */}
      <div className="flex h-6 items-center gap-2 border-b">
        <ExpandToggle
          expanded={!collapsed}
          onClick={() => toggleCollapsed("tokens")}
          aria-label={collapsed ? `Expand ${TOKENS_LABEL}` : `Collapse ${TOKENS_LABEL}`}
          chevronClassName="size-3.5"
          className="shrink-0 rounded"
        />
        <h3 className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
          {TOKENS_LABEL}
        </h3>
        <TokensHint />
        {count}
      </div>
      {!collapsed && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tokens.map((entry) => (
            <TokenThumb
              key={entry.card.slug}
              entry={entry}
              onSelect={() => selectToken(entry)}
              onHoverCard={onHoverCard}
            />
          ))}
        </div>
      )}
    </section>
  );
}
