import type {
  Card,
  CardType,
  DeckCardResponse,
  DeckFormat,
  DeckViolation,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared";
import { WellKnown, validateDeck } from "@openrift/shared";
import { create } from "zustand";

const EMPTY_ARRAY: string[] = [];

export interface DeckBuilderCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  keywords: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
}

interface DeckBuilderState {
  deckId: string | null;
  format: DeckFormat;
  cards: DeckBuilderCard[];
  activeZone: DeckZone;
  isDirty: boolean;
  violations: DeckViolation[];
  runesByDomain: Map<string, DeckBuilderCard[]>;

  init: (deckId: string, format: DeckFormat, cards: DeckBuilderCard[]) => void;
  addCard: (card: DeckBuilderCard, zone?: DeckZone, count?: number) => void;
  removeCard: (cardId: string, zone: DeckZone) => void;
  moveCard: (cardId: string, fromZone: DeckZone, toZone: DeckZone) => void;
  moveOneCard: (cardId: string, fromZone: DeckZone, toZone: DeckZone) => void;
  setQuantity: (cardId: string, zone: DeckZone, quantity: number) => void;
  setActiveZone: (zone: DeckZone) => void;
  setLegend: (card: DeckBuilderCard, runesByDomain?: Map<string, DeckBuilderCard[]>) => void;
  setRunesByDomain: (runesByDomain: Map<string, DeckBuilderCard[]>) => void;
  markSaved: () => void;
  reset: () => void;
}

/**
 * Checks whether a card is allowed in a given zone based on its type/supertypes.
 *
 * @returns true if the card's type is valid for the zone
 */
export function isCardAllowedInZone(
  card: { cardType: CardType; superTypes: SuperType[] },
  zone: DeckZone,
): boolean {
  switch (zone) {
    case WellKnown.deckZone.LEGEND: {
      return card.cardType === WellKnown.cardType.LEGEND;
    }
    case WellKnown.deckZone.CHAMPION: {
      return (
        card.superTypes.includes(WellKnown.superType.CHAMPION) &&
        card.cardType !== WellKnown.cardType.LEGEND
      );
    }
    case WellKnown.deckZone.RUNES: {
      return card.cardType === WellKnown.cardType.RUNE;
    }
    case WellKnown.deckZone.BATTLEFIELD: {
      return card.cardType === WellKnown.cardType.BATTLEFIELD;
    }
    case WellKnown.deckZone.MAIN:
    case WellKnown.deckZone.SIDEBOARD:
    case WellKnown.deckZone.OVERFLOW: {
      return (
        card.cardType !== WellKnown.cardType.LEGEND &&
        card.cardType !== WellKnown.cardType.RUNE &&
        card.cardType !== WellKnown.cardType.BATTLEFIELD
      );
    }
    default: {
      return false;
    }
  }
}

const RUNE_TARGET = 12;

/**
 * After a rune is added or removed, adjust a rune of the opposite domain so
 * the total stays at RUNE_TARGET. When incrementing and no opposite-domain rune
 * exists in the deck, falls back to the catalog.
 *
 * @returns a new cards array with the adjustment applied (or the same array if
 * no adjustment was needed).
 */
function rebalanceRunes(
  cards: DeckBuilderCard[],
  changedDomains: Domain[],
  runesByDomain: Map<string, DeckBuilderCard[]>,
): DeckBuilderCard[] {
  const runeTotal = cards
    .filter((card) => card.zone === "runes")
    .reduce((sum, card) => sum + card.quantity, 0);

  if (runeTotal === RUNE_TARGET) {
    return cards;
  }

  const legend = cards.find((card) => card.zone === "legend");
  if (!legend || legend.domains.length < 2) {
    return cards;
  }

  const otherDomain = legend.domains.find((domain) => !changedDomains.includes(domain));
  if (!otherDomain) {
    return cards;
  }

  if (runeTotal > RUNE_TARGET) {
    // Over target — decrement an opposite-domain rune
    const otherRune = cards.find(
      (card) => card.zone === "runes" && card.domains.some((domain) => domain === otherDomain),
    );
    if (!otherRune) {
      return cards;
    }
    return otherRune.quantity > 1
      ? cards.map((card) =>
          card.cardId === otherRune.cardId && card.zone === "runes"
            ? { ...card, quantity: card.quantity - 1 }
            : card,
        )
      : cards.filter((card) => !(card.cardId === otherRune.cardId && card.zone === "runes"));
  }

  // Under target — increment an opposite-domain rune (or add from catalog)
  const existingOtherRune = cards.find(
    (card) => card.zone === "runes" && card.domains.some((domain) => domain === otherDomain),
  );
  if (existingOtherRune) {
    return cards.map((card) =>
      card.cardId === existingOtherRune.cardId && card.zone === "runes"
        ? { ...card, quantity: card.quantity + 1 }
        : card,
    );
  }
  const catalogRunes = runesByDomain.get(otherDomain) ?? [];
  if (catalogRunes.length > 0) {
    return [...cards, { ...catalogRunes[0], zone: "runes" as DeckZone, quantity: 1 }];
  }
  return cards;
}

function revalidate(format: DeckFormat, cards: DeckBuilderCard[]): DeckViolation[] {
  return validateDeck({
    format,
    cards: cards.map((card) => ({
      cardId: card.cardId,
      zone: card.zone,
      quantity: card.quantity,
      cardName: card.cardName,
      cardType: card.cardType,
      superTypes: card.superTypes,
      domains: card.domains,
      tags: card.tags,
    })),
  });
}

export const useDeckBuilderStore = create<DeckBuilderState>()((set) => ({
  deckId: null,
  format: "standard",
  cards: [],
  activeZone: "main",
  isDirty: false,
  violations: [],
  runesByDomain: new Map(),

  init: (deckId, format, cards) =>
    set({
      deckId,
      format,
      cards,
      isDirty: false,
      violations: revalidate(format, cards),
    }),

  addCard: (card, zone, count) =>
    set((state) => {
      const targetZone = zone ?? state.activeZone;

      // Reject cards whose type doesn't belong in this zone
      if (!isCardAllowedInZone(card, targetZone)) {
        return state;
      }

      const isSingleCardZone = targetZone === "legend" || targetZone === "champion";
      const isUniqueOnlyZone = targetZone === "battlefield";

      let nextCards: DeckBuilderCard[];
      if (isSingleCardZone) {
        // Replace whatever is in the zone with this card
        nextCards = [
          ...state.cards.filter((entry) => entry.zone !== targetZone),
          { ...card, zone: targetZone, quantity: 1 },
        ];
      } else if (isUniqueOnlyZone) {
        // Only add if this card isn't already in the zone and zone isn't full
        const zoneCards = state.cards.filter((entry) => entry.zone === targetZone);
        const alreadyInZone = zoneCards.some((entry) => entry.cardId === card.cardId);
        nextCards =
          alreadyInZone || zoneCards.length >= 3
            ? state.cards
            : [...state.cards, { ...card, zone: targetZone, quantity: 1 }];
      } else if (targetZone === "runes") {
        // Rune zone: add rune(s) one at a time, rebalancing after each addition
        const addQty = count ?? 1;
        nextCards = state.cards;
        for (let step = 0; step < addQty; step++) {
          const existing = nextCards.find(
            (entry) => entry.cardId === card.cardId && entry.zone === targetZone,
          );
          const candidate = existing
            ? nextCards.map((entry) =>
                entry.cardId === card.cardId && entry.zone === targetZone
                  ? { ...entry, quantity: entry.quantity + 1 }
                  : entry,
              )
            : [...nextCards, { ...card, zone: targetZone, quantity: 1 }];
          const rebalanced = rebalanceRunes(candidate, card.domains, state.runesByDomain);

          // If rebalancing couldn't compensate, stop adding
          const runeTotal = rebalanced
            .filter((entry) => entry.zone === "runes")
            .reduce((sum, entry) => sum + entry.quantity, 0);
          if (runeTotal > RUNE_TARGET) {
            break;
          }
          nextCards = rebalanced;
        }
        if (nextCards === state.cards) {
          return state;
        }
      } else {
        // Enforce max 3 copies across main + sideboard + overflow + champion
        const copyLimitZones = new Set(["main", "sideboard", "overflow", "champion"]);
        let addQty = count ?? 1;
        if (copyLimitZones.has(targetZone)) {
          const crossZoneTotal = state.cards
            .filter((entry) => entry.cardId === card.cardId && copyLimitZones.has(entry.zone))
            .reduce((sum, entry) => sum + entry.quantity, 0);
          if (crossZoneTotal >= 3) {
            return { cards: state.cards, isDirty: state.isDirty, violations: state.violations };
          }
          addQty = Math.min(addQty, 3 - crossZoneTotal);
        }

        const existing = state.cards.find(
          (entry) => entry.cardId === card.cardId && entry.zone === targetZone,
        );
        nextCards = existing
          ? state.cards.map((entry) =>
              entry.cardId === card.cardId && entry.zone === targetZone
                ? { ...entry, quantity: entry.quantity + addQty }
                : entry,
            )
          : [...state.cards, { ...card, zone: targetZone, quantity: addQty }];
      }

      return {
        cards: nextCards,
        isDirty: true,
        violations: revalidate(state.format, nextCards),
      };
    }),

  removeCard: (cardId, zone) =>
    set((state) => {
      const existing = state.cards.find((card) => card.cardId === cardId && card.zone === zone);
      if (!existing) {
        return state;
      }

      let nextCards =
        existing.quantity > 1
          ? state.cards.map((card) =>
              card.cardId === cardId && card.zone === zone
                ? { ...card, quantity: card.quantity - 1 }
                : card,
            )
          : state.cards.filter((card) => !(card.cardId === cardId && card.zone === zone));

      // Rune rebalancing: keep total at RUNE_TARGET by adjusting the other domain
      if (zone === "runes") {
        nextCards = rebalanceRunes(nextCards, existing.domains, state.runesByDomain);
      }

      return {
        cards: nextCards,
        isDirty: true,
        violations: revalidate(state.format, nextCards),
      };
    }),

  moveCard: (cardId, fromZone, toZone) =>
    set((state) => {
      const source = state.cards.find((card) => card.cardId === cardId && card.zone === fromZone);
      if (!source || !isCardAllowedInZone(source, toZone)) {
        return state;
      }

      // Remove from source zone
      const withoutSource = state.cards.filter(
        (card) => !(card.cardId === cardId && card.zone === fromZone),
      );

      // Add to target zone (merge if already exists there)
      const targetExisting = withoutSource.find(
        (card) => card.cardId === cardId && card.zone === toZone,
      );

      const nextCards = targetExisting
        ? withoutSource.map((card) =>
            card.cardId === cardId && card.zone === toZone
              ? { ...card, quantity: card.quantity + source.quantity }
              : card,
          )
        : [...withoutSource, { ...source, zone: toZone }];

      return {
        cards: nextCards,
        isDirty: true,
        violations: revalidate(state.format, nextCards),
      };
    }),

  moveOneCard: (cardId, fromZone, toZone) =>
    set((state) => {
      const source = state.cards.find((card) => card.cardId === cardId && card.zone === fromZone);
      if (!source || !isCardAllowedInZone(source, toZone)) {
        return state;
      }

      // Decrement source (or remove if quantity is 1)
      let nextCards =
        source.quantity > 1
          ? state.cards.map((card) =>
              card.cardId === cardId && card.zone === fromZone
                ? { ...card, quantity: card.quantity - 1 }
                : card,
            )
          : state.cards.filter((card) => !(card.cardId === cardId && card.zone === fromZone));

      // Increment target (or add new entry)
      const targetExisting = nextCards.find(
        (card) => card.cardId === cardId && card.zone === toZone,
      );
      nextCards = targetExisting
        ? nextCards.map((card) =>
            card.cardId === cardId && card.zone === toZone
              ? { ...card, quantity: card.quantity + 1 }
              : card,
          )
        : [...nextCards, { ...source, zone: toZone, quantity: 1 }];

      return {
        cards: nextCards,
        isDirty: true,
        violations: revalidate(state.format, nextCards),
      };
    }),

  setQuantity: (cardId, zone, quantity) =>
    set((state) => {
      const nextCards =
        quantity <= 0
          ? state.cards.filter((card) => !(card.cardId === cardId && card.zone === zone))
          : state.cards.map((card) =>
              card.cardId === cardId && card.zone === zone ? { ...card, quantity } : card,
            );

      return {
        cards: nextCards,
        isDirty: true,
        violations: revalidate(state.format, nextCards),
      };
    }),

  setActiveZone: (zone) => set({ activeZone: zone }),

  setLegend: (card, runesByDomain) =>
    set((state) => {
      // Replace legend zone with this card
      let nextCards = state.cards.filter((existing) => existing.zone !== "legend");
      nextCards = [...nextCards, { ...card, zone: "legend", quantity: 1 }];

      // Clear runes that don't match the new legend's domains so they get
      // repopulated below. This handles both direct swaps and remove-then-add.
      const legendDomainSet = new Set(card.domains);
      const hasIncompatibleRunes = nextCards.some(
        (existing) =>
          existing.zone === "runes" &&
          !existing.domains.every((domain) => legendDomainSet.has(domain)),
      );
      if (hasIncompatibleRunes) {
        nextCards = nextCards.filter((existing) => existing.zone !== "runes");
      }

      // Auto-populate runes if runes zone is empty and we have rune data.
      // Distributes 6 slots per domain across available rune cards, grouping
      // by card ID so each unique rune gets a single entry with quantity > 1.
      const hasRunes = nextCards.some((existing) => existing.zone === "runes");
      if (!hasRunes && runesByDomain && card.domains.length >= 2) {
        const runeEntries = new Map<string, DeckBuilderCard>();

        const fillDomain = (domain: string, target: number) => {
          const runes = runesByDomain.get(domain) ?? [];
          if (runes.length === 0) {
            return;
          }
          let remaining = target;
          let index = 0;
          while (remaining > 0) {
            const rune = runes[index % runes.length];
            const existing = runeEntries.get(rune.cardId);
            if (existing) {
              existing.quantity++;
            } else {
              runeEntries.set(rune.cardId, { ...rune, zone: "runes", quantity: 1 });
            }
            remaining--;
            index++;
          }
        };

        fillDomain(card.domains[0], 6);
        fillDomain(card.domains[1], 6);
        nextCards = [...nextCards, ...runeEntries.values()];
      }

      return {
        cards: nextCards,
        isDirty: true,
        violations: revalidate(state.format, nextCards),
        runesByDomain: runesByDomain ?? state.runesByDomain,
      };
    }),

  setRunesByDomain: (runesByDomain) => set({ runesByDomain }),

  markSaved: () =>
    set((state) => ({ isDirty: false, violations: revalidate(state.format, state.cards) })),

  reset: () =>
    set({
      deckId: null,
      format: "standard",
      cards: [],
      activeZone: "main",
      isDirty: false,
      violations: [],
      runesByDomain: new Map(),
    }),
}));

// Converts a catalog Card to a DeckBuilderCard (for adding from the browser).
export function catalogCardToDeckBuilderCard(card: Card): DeckBuilderCard {
  return {
    cardId: card.id,
    zone: "main",
    quantity: 1,
    cardName: card.name,
    cardType: card.type,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    keywords: card.keywords,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}

/**
 * Converts an API DeckCardResponse to a DeckBuilderCard by resolving card
 * metadata from the catalog.
 * @returns A DeckBuilderCard with full card data, or null if card not found.
 */
export function toDeckBuilderCard(
  deckCard: DeckCardResponse,
  cardsById: Record<string, Card>,
): DeckBuilderCard | null {
  const card = cardsById[deckCard.cardId];
  if (!card) {
    return null;
  }
  return {
    cardId: deckCard.cardId,
    zone: deckCard.zone,
    quantity: deckCard.quantity,
    cardName: card.name,
    cardType: card.type,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags ?? EMPTY_ARRAY,
    keywords: card.keywords ?? EMPTY_ARRAY,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}
