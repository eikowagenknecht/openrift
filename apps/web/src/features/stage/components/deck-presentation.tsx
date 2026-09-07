import type { DeckZone } from "@openrift/shared/types/enums";

import { useCards } from "@/features/cards/hooks/use-cards";
import { useDeckItems } from "@/features/decks/hooks/use-deck-items";
import { useDeckDetail } from "@/features/decks/hooks/use-decks";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { CardStageMain } from "@/features/stage/components/card-stage-main";
import { PresentationStage } from "@/features/stage/components/presentation-stage";
import type { PresentationItem } from "@/features/stage/lib/presentation-queue";
import { useZoneOrder } from "@/hooks/use-enums";

/**
 * Kept as its own component so the deck queries are never called on the
 * ad-hoc-queue path, which resolves its cards differently.
 */
export function DeckPresentation({
  deckId,
  zone,
  index,
  onIndexChange,
  onExit,
}: {
  deckId: string;
  /** Restricts the walk to one zone; the whole deck when omitted. */
  zone?: DeckZone;
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
}) {
  const { data } = useDeckDetail(deckId);
  const { cardsById } = useCards();
  const { zoneLabels } = useZoneOrder();

  const builderCards = data.cards
    .map((card) => toDeckBuilderCard(card, cardsById))
    .filter((card): card is DeckBuilderCard => card !== null);
  const { items } = useDeckItems(builderCards);

  // Resolved here, not on the stage: a stage that knows zone labels is a
  // stage that knows what a deck is, and a tier list has no zones.
  const shown: PresentationItem[] = (zone ? items.filter((item) => item.zone === zone) : items).map(
    (item) => ({
      id: item.id,
      printing: item.printing,
      contextLabel: item.zone ? zoneLabels[item.zone] : undefined,
    }),
  );

  return (
    <PresentationStage
      items={shown}
      index={index}
      onIndexChange={onIndexChange}
      onExit={onExit}
      exitLabel="Back to the deck"
      title={data.deck.name}
    >
      <CardStageMain items={shown} index={index} />
    </PresentationStage>
  );
}
