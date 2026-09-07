import type { DeckZone } from "@openrift/shared/types/enums";

import { DeckCardGroupHeader } from "@/components/deck/deck-card-group-header";
import { StackPile } from "@/components/deck/deck-stack-pile";
import { ZoneThumb } from "@/components/deck/deck-zone-thumbs";
import type { CardOpenTarget, HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import type { DeckCardGroup, DeckOverviewGroup } from "@/lib/deck-card-group";
import { expandCopies } from "@/lib/deck-overview-derive";
import type { OwnershipBandSegments } from "@/lib/deck-ownership-band";
import type { StatsFocus } from "@/lib/deck-stats-focus";
import { cardMatchesStatsFocus } from "@/lib/deck-stats-focus";

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
  priceTextByCardKey: ReadonlyMap<string, string>;
  addRoomByCardKey: ReadonlyMap<string, number>;
  resolveHoverPrintingId: (cardId: string, preferredPrintingId: string | null) => string | null;
  showAllCopies: boolean;
  statsFocus: StatsFocus | null;
  zone: DeckZone;
  groups: DeckCardGroup[];
  sortCards: (cards: DeckBuilderCard[]) => DeckBuilderCard[];
  groupBy: DeckOverviewGroup;
  stacked: boolean;
  isLandscape: boolean;
  onHoverCard?: HoverHandler;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  onCardClick?: (card: CardOpenTarget) => void;
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
