import type { CardType, DeckCardResponse } from "@openrift/shared";
import { CARD_TYPE_ORDER } from "@openrift/shared";

const TYPE_COLORS: Record<string, string> = {
  Unit: "#4A90D9",
  Spell: "#9B59B6",
  Gear: "#E67E22",
};

const EXCLUDED_TYPES = new Set(["Legend", "Rune", "Battlefield"]);
const COUNTED_ZONES = new Set(["main", "sideboard", "champion"]);

/**
 * Lightweight stacked bar showing card type distribution.
 * @returns The card type breakdown bar, or null if no countable cards.
 */
export function CardTypeBar({ cards }: { cards: DeckCardResponse[] }) {
  const countsByType = new Map<CardType, number>();
  let total = 0;

  for (const card of cards) {
    if (!COUNTED_ZONES.has(card.zone) || EXCLUDED_TYPES.has(card.cardType)) {
      continue;
    }
    countsByType.set(card.cardType, (countsByType.get(card.cardType) ?? 0) + card.quantity);
    total += card.quantity;
  }

  if (total === 0) {
    return null;
  }

  const segments = CARD_TYPE_ORDER.filter((type) => countsByType.has(type)).map((type) => {
    const count = countsByType.get(type) ?? 0;
    return {
      type,
      count,
      color: TYPE_COLORS[type] ?? "#737373",
      percent: ((count / total) * 100).toFixed(1),
    };
  });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {segments.map((segment) => (
          <div
            key={segment.type}
            className="h-full"
            style={{
              flexBasis: `${segment.percent}%`,
              backgroundColor: segment.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0">
        {segments.map((segment) => (
          <span key={segment.type} className="flex items-center gap-1 text-[10px]">
            <span
              className="inline-block size-1.5 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-muted-foreground">
              {segment.type} {segment.count}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
