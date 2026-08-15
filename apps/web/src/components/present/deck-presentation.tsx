import type { DeckZone } from "@openrift/shared";

import { CardStageMain } from "@/components/present/card-stage-main";
import { PresentationStage } from "@/components/present/presentation-stage";
import { useCards } from "@/hooks/use-cards";
import { useDeckItems } from "@/hooks/use-deck-items";
import { useDeckDetail } from "@/hooks/use-decks";
import { useZoneOrder } from "@/hooks/use-enums";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toDeckBuilderCard } from "@/lib/deck-builder-card";
import type { PresentationItem } from "@/lib/presentation-queue";

/**
 * Presents a deck, walking its zones in the order the overview stacks them.
 * Kept as its own component so the deck queries are never called on the
 * ad-hoc-queue path — the two sources resolve their cards completely
 * differently and would otherwise have to share one conditional hook chain.
 *
 * @returns The stage, driven by the deck's cards.
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

  // The zone becomes the corner marker's context here rather than on the stage:
  // a stage that resolved zone labels itself would be a stage that knows what a
  // deck is, and a tier list has no zones to give it.
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
