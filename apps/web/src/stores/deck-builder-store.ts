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
import { validateDeck } from "@openrift/shared";
import { create } from "zustand";

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
  addCard: (card: DeckBuilderCard, zone?: DeckZone) => void;
  removeCard: (cardId: string, zone: DeckZone) => void;
  moveCard: (cardId: string, fromZone: DeckZone, toZone: DeckZone) => void;
  moveOneCard: (cardId: string, fromZone: DeckZone, toZone: DeckZone) => void;
  setQuantity: (cardId: string, zone: DeckZone, quantity: number) => void;
  setActiveZone: (zone: DeckZone) => void;
  setLegend: (card: DeckBuilderCard, runesByDomain?: Map<string, DeckBuilderCard[]>) => void;
  markSaved: () => void;
  reset: () => void;
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

  addCard: (card, zone) =>
    set((state) => {
      const targetZone = zone ?? state.activeZone;
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
        // Only add if this card isn't already in the zone
        const alreadyInZone = state.cards.some(
          (entry) => entry.cardId === card.cardId && entry.zone === targetZone,
        );
        nextCards = alreadyInZone
          ? state.cards
          : [...state.cards, { ...card, zone: targetZone, quantity: 1 }];
      } else {
        // Enforce max 3 copies across main + sideboard + overflow
        const copyLimitZones = new Set(["main", "sideboard", "overflow"]);
        if (copyLimitZones.has(targetZone)) {
          const crossZoneTotal = state.cards
            .filter((entry) => entry.cardId === card.cardId && copyLimitZones.has(entry.zone))
            .reduce((sum, entry) => sum + entry.quantity, 0);
          if (crossZoneTotal >= 3) {
            return { cards: state.cards, isDirty: state.isDirty, violations: state.violations };
          }
        }

        const existing = state.cards.find(
          (entry) => entry.cardId === card.cardId && entry.zone === targetZone,
        );
        nextCards = existing
          ? state.cards.map((entry) =>
              entry.cardId === card.cardId && entry.zone === targetZone
                ? { ...entry, quantity: entry.quantity + 1 }
                : entry,
            )
          : [...state.cards, { ...card, zone: targetZone, quantity: 1 }];
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

      // Rune rebalancing: when removing a rune, add one of the other domain
      // to keep the total at 12. Only rebalance when at exactly 12 (not when over).
      const runeTotal = nextCards
        .filter((card) => card.zone === "runes")
        .reduce((sum, card) => sum + card.quantity, 0);
      if (zone === "runes" && runeTotal < 12) {
        const legend = nextCards.find((card) => card.zone === "legend");
        if (legend && legend.domains.length >= 2) {
          const removedDomains = existing.domains;
          const otherDomain = legend.domains.find((domain) => !removedDomains.includes(domain));
          if (otherDomain) {
            // Try to increment an existing rune of the other domain in the deck
            const existingOtherRune = nextCards.find(
              (card) =>
                card.zone === "runes" && card.domains.some((domain) => domain === otherDomain),
            );
            if (existingOtherRune) {
              nextCards = nextCards.map((card) =>
                card.cardId === existingOtherRune.cardId && card.zone === "runes"
                  ? { ...card, quantity: card.quantity + 1 }
                  : card,
              );
            } else {
              // No existing rune of that domain in deck — find one from catalog
              const catalogRunes = state.runesByDomain.get(otherDomain) ?? [];
              if (catalogRunes.length > 0) {
                nextCards = [...nextCards, { ...catalogRunes[0], zone: "runes", quantity: 1 }];
              }
            }
          }
        }
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
      if (!source) {
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
      if (!source) {
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

// Converts an API DeckCardResponse to a DeckBuilderCard (for loading saved decks).
export function toDeckBuilderCard(card: DeckCardResponse): DeckBuilderCard {
  return {
    cardId: card.cardId,
    zone: card.zone,
    quantity: card.quantity,
    cardName: card.cardName,
    cardType: card.cardType,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    keywords: card.keywords,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}
