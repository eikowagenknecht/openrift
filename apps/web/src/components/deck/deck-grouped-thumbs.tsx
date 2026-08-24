import type { DeckZone } from "@openrift/shared";

import { DeckCardGroupHeader } from "@/components/deck/deck-card-group-header";
import { StackPile } from "@/components/deck/deck-stack-pile";
import { ZoneThumb } from "@/components/deck/deck-zone-thumbs";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import type { DeckCardGroup, DeckOverviewGroup } from "@/lib/deck-card-group";
import { expandCopies } from "@/lib/deck-overview-derive";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import { cardMatchesStatsFocus } from "@/lib/deck-stats-focus";

/**
 * Renders grouped thumbs for main / sideboard / overflow zones. Each sub-group
 * along the chosen axis (types by default) gets its own row with a name +
 * count header above a flex-wrap of thumbs, mirroring the sidebar's grouped
 * layout but with thumbnails instead of list rows. The single "none" group
 * renders headerless as one flat wrap.
 * @returns Stacked sub-group sections.
 */
export function GroupedThumbs({
  deckId,
  bandByCardKey,
  priceTextByCardKey,
  addRoomByCardKey,
  resolveHoverPrintingId,
  showAllCopies,
  statsFocus,
  zone,
  groups,
  sortCards,
  groupBy,
  stacked,
  isLandscape,
  onHoverCard,
  getThumbnail,
  readOnly,
  onCardClick,
}: {
  deckId: string;
  bandByCardKey: ReadonlyMap<string, OwnershipBandSegments>;
  /** Deck card key -> preformatted price chip text; empty when chips are off. */
  priceTextByCardKey: ReadonlyMap<string, string>;
  /** Copies each entry may still add, keyed by deck card key (empty read-only). */
  addRoomByCardKey: ReadonlyMap<string, number>;
  /** Printing id the hover preview should show for an entry. */
  resolveHoverPrintingId: (cardId: string, preferredPrintingId: string | null) => string | null;
  showAllCopies: boolean;
  statsFocus: StatsFocus | null;
  zone: DeckZone;
  groups: DeckCardGroup[];
  /** Orders cards inside one sub-group (see sortDeckOverviewList). */
  sortCards: (cards: DeckBuilderCard[]) => DeckBuilderCard[];
  /** The active grouping axis — type groups keep their icons. */
  groupBy: DeckOverviewGroup;
  /** Stacks mode: piles of name strips with the last card fully visible. */
  stacked: boolean;
  isLandscape: boolean;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  onCardClick?: (card: DeckBuilderCard) => void;
}) {
  if (stacked) {
    return (
      // Piles sit on the measured column grid: each is exactly one card wide,
      // separated by the same gap the thumbs use.
      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-3">
        {groups.map((group) => (
          <div
            key={group.key}
            className="flex min-w-0 flex-col gap-1.5"
            style={{ width: "var(--deck-card-w)" }}
          >
            <DeckCardGroupHeader group={group} groupBy={groupBy} truncate />
            <StackPile
              deckId={deckId}
              entries={expandCopies(sortCards(group.cards), showAllCopies)}
              zone={zone}
              bandByCardKey={bandByCardKey}
              priceTextByCardKey={priceTextByCardKey}
              addRoomByCardKey={addRoomByCardKey}
              resolveHoverPrintingId={resolveHoverPrintingId}
              statsFocus={statsFocus}
              getThumbnail={getThumbnail}
              readOnly={readOnly}
              onCardClick={onCardClick}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <DeckCardGroupHeader group={group} groupBy={groupBy} />
          <div className="flex flex-wrap items-center gap-1.5">
            {expandCopies(sortCards(group.cards), showAllCopies).map(({ card, copyIndex }) => {
              const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
              if (!thumbnail) {
                return null;
              }
              return (
                <ZoneThumb
                  key={`${getDeckCardKey(card)}-${copyIndex ?? "stack"}`}
                  deckId={deckId}
                  card={card}
                  band={bandByCardKey.get(getDeckCardKey(card))}
                  priceText={priceTextByCardKey.get(getDeckCardKey(card))}
                  addRoom={addRoomByCardKey.get(getDeckCardKey(card)) ?? 0}
                  hoverPrintingId={resolveHoverPrintingId(card.cardId, card.preferredPrintingId)}
                  copyIndex={copyIndex}
                  dimmed={statsFocus !== null && !cardMatchesStatsFocus(card, statsFocus)}
                  zone={zone}
                  thumbnail={thumbnail}
                  isLandscape={isLandscape}
                  onHoverCard={onHoverCard}
                  readOnly={readOnly}
                  onCardClick={onCardClick}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
