import type {
  DeckFormat,
  DeckFormatConfig,
  DeckViolation,
  DeckZone,
  Domain,
} from "@openrift/shared";
import { WellKnown, copyLimitFor, validateDeck } from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import type { Collection } from "@tanstack/react-db";

import { useCustomTagAssignments } from "@/hooks/use-custom-tag-assignments";
import { useDeckDetail } from "@/hooks/use-decks";
import { useChampionIdentifierTags } from "@/hooks/use-enums";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  COPY_LIMIT_ZONES,
  deckCardKey,
  isCardAllowedInZone,
  RUNE_TARGET,
  toRuleEngineCard,
} from "@/lib/deck-builder-card";
import { useDeckDraftCollection } from "@/lib/deck-builder-collection";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDeckUndoStore } from "@/stores/deck-undo-store";

const EMPTY_CARDS: DeckBuilderCard[] = [];

type DeckCollection = Collection<DeckBuilderCard, string | number>;

export function allCards(collection: DeckCollection): DeckBuilderCard[] {
  return [...collection.values()];
}

function runeTotalOf(cards: DeckBuilderCard[]): number {
  let total = 0;
  for (const card of cards) {
    if (card.zone === WellKnown.deckZone.RUNES) {
      total += card.quantity;
    }
  }
  return total;
}

/**
 * Prefers the default-art row (preferredPrintingId === null) so pinned
 * printings stay sticky when users decrement via the card browser.
 */
function findRowForCardInZone(
  cards: DeckBuilderCard[],
  cardId: string,
  zone: DeckZone,
): DeckBuilderCard | undefined {
  const matches = cards.filter((c) => c.cardId === cardId && c.zone === zone);
  if (matches.length === 0) {
    return undefined;
  }
  return matches.find((c) => c.preferredPrintingId === null) ?? matches[0];
}

/**
 * After a rune is added or removed, adjusts a rune of the opposite domain so
 * the total stays at RUNE_TARGET, falling back to the catalog's runesByDomain.
 */
function rebalanceRunes(
  collection: DeckCollection,
  changedDomains: Domain[],
  runesByDomain: Map<string, DeckBuilderCard[]>,
): void {
  const cards = allCards(collection);
  const runeTotal = runeTotalOf(cards);
  if (runeTotal === RUNE_TARGET) {
    return;
  }

  const legend = cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  if (!legend || legend.domains.length < 2) {
    return;
  }

  const otherDomain = legend.domains.find((domain) => !changedDomains.includes(domain));
  if (!otherDomain) {
    return;
  }

  if (runeTotal > RUNE_TARGET) {
    const otherRune = cards.find(
      (card) =>
        card.zone === WellKnown.deckZone.RUNES &&
        card.domains.some((domain) => domain === otherDomain),
    );
    if (!otherRune) {
      return;
    }
    const key = deckCardKey(
      otherRune.cardId,
      WellKnown.deckZone.RUNES,
      otherRune.preferredPrintingId,
    );
    if (otherRune.quantity > 1) {
      collection.update(key, (draft) => {
        draft.quantity -= 1;
      });
    } else {
      collection.delete(key);
    }
    return;
  }

  const existingOther = cards.find(
    (card) =>
      card.zone === WellKnown.deckZone.RUNES &&
      card.domains.some((domain) => domain === otherDomain),
  );
  if (existingOther) {
    collection.update(
      deckCardKey(
        existingOther.cardId,
        WellKnown.deckZone.RUNES,
        existingOther.preferredPrintingId,
      ),
      (draft) => {
        draft.quantity += 1;
      },
    );
    return;
  }
  const catalogRunes = runesByDomain.get(otherDomain) ?? [];
  if (catalogRunes.length > 0) {
    collection.insert({
      ...catalogRunes[0],
      zone: WellKnown.deckZone.RUNES,
      quantity: 1,
      preferredPrintingId: null,
    });
  }
}

function crossZoneTotal(cards: DeckBuilderCard[], cardId: string): number {
  let total = 0;
  for (const card of cards) {
    if (card.cardId === cardId && COPY_LIMIT_ZONES.has(card.zone)) {
      total += card.quantity;
    }
  }
  return total;
}

/**
 * At the RUNE_TARGET cap, an add is only valid when rebalanceRunes can
 * decrement an already-present opposite-domain rune of a dual-domain legend.
 */
export function canAddRune(card: DeckBuilderCard, deckCards: DeckBuilderCard[]): boolean {
  const runeTotal = runeTotalOf(deckCards);
  if (runeTotal < RUNE_TARGET) {
    return true;
  }
  const legend = deckCards.find((entry) => entry.zone === WellKnown.deckZone.LEGEND);
  if (!legend || legend.domains.length < 2) {
    return false;
  }
  const otherDomain = legend.domains.find((domain) => !card.domains.includes(domain));
  if (!otherDomain) {
    return false;
  }
  return deckCards.some(
    (entry) =>
      entry.zone === WellKnown.deckZone.RUNES &&
      entry.domains.some((domain) => domain === otherDomain),
  );
}

function incrementOrInsert(
  collection: DeckCollection,
  card: DeckBuilderCard,
  zone: DeckZone,
  preferredPrintingId: string | null,
  addQty: number,
): void {
  const key = deckCardKey(card.cardId, zone, preferredPrintingId);
  const existing = collection.get(key);
  if (existing) {
    collection.update(key, (draft) => {
      draft.quantity += addQty;
    });
  } else {
    collection.insert({ ...card, zone, quantity: addQty, preferredPrintingId });
  }
}

export function addCardAction(
  collection: DeckCollection,
  card: DeckBuilderCard,
  zone: DeckZone,
  count: number | undefined,
  runesByDomain: Map<string, DeckBuilderCard[]>,
  format: DeckFormat,
): void {
  if (!isCardAllowedInZone(card, zone)) {
    return;
  }
  const preferredPrintingId = card.preferredPrintingId;
  const freeform = format === WellKnown.deckFormat.FREEFORM;

  if (zone === WellKnown.deckZone.LEGEND || zone === WellKnown.deckZone.CHAMPION) {
    if (freeform) {
      incrementOrInsert(collection, card, zone, preferredPrintingId, count ?? 1);
      return;
    }
    // Constructed: single-card zones replace whatever is there, across any printing.
    for (const existing of allCards(collection)) {
      if (existing.zone === zone) {
        collection.delete(deckCardKey(existing.cardId, zone, existing.preferredPrintingId));
      }
    }
    collection.insert({ ...card, zone, quantity: 1, preferredPrintingId });
    return;
  }

  if (zone === WellKnown.deckZone.BATTLEFIELD) {
    if (freeform) {
      incrementOrInsert(collection, card, zone, preferredPrintingId, count ?? 1);
      return;
    }
    const cards = allCards(collection);
    const zoneCards = cards.filter((entry) => entry.zone === WellKnown.deckZone.BATTLEFIELD);
    if (zoneCards.some((entry) => entry.cardId === card.cardId)) {
      return;
    }
    // Custom-region allows exactly one battlefield, constructed three.
    const battlefieldCap = format === WellKnown.deckFormat.CUSTOM_REGION ? 1 : 3;
    if (zoneCards.length >= battlefieldCap) {
      return;
    }
    collection.insert({ ...card, zone, quantity: 1, preferredPrintingId });
    return;
  }

  if (zone === WellKnown.deckZone.RUNES) {
    if (freeform) {
      incrementOrInsert(collection, card, zone, preferredPrintingId, count ?? 1);
      return;
    }
    const addQty = count ?? 1;
    for (let step = 0; step < addQty; step++) {
      const cards = allCards(collection);
      if (!canAddRune(card, cards)) {
        break;
      }
      const existing = cards.find(
        (entry) =>
          entry.cardId === card.cardId &&
          entry.zone === WellKnown.deckZone.RUNES &&
          entry.preferredPrintingId === preferredPrintingId,
      );
      if (existing) {
        collection.update(
          deckCardKey(card.cardId, WellKnown.deckZone.RUNES, preferredPrintingId),
          (draft) => {
            draft.quantity += 1;
          },
        );
      } else {
        collection.insert({
          ...card,
          zone: WellKnown.deckZone.RUNES,
          quantity: 1,
          preferredPrintingId,
        });
      }
      rebalanceRunes(collection, card.domains, runesByDomain);
    }
    return;
  }

  // Overflow is a free parking zone, not in COPY_LIMIT_ZONES, so it skips the cap.
  let addQty = count ?? 1;
  if (!freeform && COPY_LIMIT_ZONES.has(zone)) {
    const limit = copyLimitFor(card);
    const total = crossZoneTotal(allCards(collection), card.cardId);
    if (total >= limit) {
      return;
    }
    addQty = Math.min(addQty, limit - total);
  }
  incrementOrInsert(collection, card, zone, preferredPrintingId, addQty);
}

/**
 * When preferredPrintingId is undefined, operates on the default-art row
 * first, so the card browser's minus button leaves pinned printings alone.
 */
export function removeCardAction(
  collection: DeckCollection,
  cardId: string,
  zone: DeckZone,
  runesByDomain: Map<string, DeckBuilderCard[]>,
  format: DeckFormat,
  preferredPrintingId?: string | null,
): void {
  const target =
    preferredPrintingId === undefined
      ? findRowForCardInZone(allCards(collection), cardId, zone)
      : collection.get(deckCardKey(cardId, zone, preferredPrintingId));
  if (!target) {
    return;
  }
  const key = deckCardKey(target.cardId, target.zone, target.preferredPrintingId);
  if (target.quantity > 1) {
    collection.update(key, (draft) => {
      draft.quantity -= 1;
    });
  } else {
    collection.delete(key);
  }
  if (zone === WellKnown.deckZone.RUNES && format !== WellKnown.deckFormat.FREEFORM) {
    rebalanceRunes(collection, target.domains, runesByDomain);
  }
}

// If the slot already holds the exact same card+printing, no-op to avoid silently dropping a copy.
function moveIntoSingleSlot(
  collection: DeckCollection,
  source: DeckBuilderCard,
  sourceKey: string,
  toZone: DeckZone,
): void {
  const existingInZone = allCards(collection).filter((card) => card.zone === toZone);
  if (
    existingInZone.length === 1 &&
    existingInZone[0].cardId === source.cardId &&
    existingInZone[0].preferredPrintingId === source.preferredPrintingId
  ) {
    return;
  }
  for (const existing of existingInZone) {
    collection.delete(deckCardKey(existing.cardId, toZone, existing.preferredPrintingId));
  }
  if (source.quantity > 1) {
    collection.update(sourceKey, (draft) => {
      draft.quantity -= 1;
    });
  } else {
    collection.delete(sourceKey);
  }
  collection.insert({ ...source, zone: toZone, quantity: 1 });
}

export function moveCardAction(
  collection: DeckCollection,
  cardId: string,
  fromZone: DeckZone,
  toZone: DeckZone,
  preferredPrintingId: string | null,
  format: DeckFormat,
): void {
  const sourceKey = deckCardKey(cardId, fromZone, preferredPrintingId);
  const source = collection.get(sourceKey);
  if (!source || !isCardAllowedInZone(source, toZone)) {
    return;
  }
  const singleSlot =
    (toZone === WellKnown.deckZone.LEGEND || toZone === WellKnown.deckZone.CHAMPION) &&
    format !== WellKnown.deckFormat.FREEFORM;
  if (singleSlot) {
    moveIntoSingleSlot(collection, source, sourceKey, toZone);
    return;
  }
  const targetKey = deckCardKey(cardId, toZone, preferredPrintingId);
  const target = collection.get(targetKey);

  collection.delete(sourceKey);
  if (target) {
    collection.update(targetKey, (draft) => {
      draft.quantity += source.quantity;
    });
  } else {
    collection.insert({ ...source, zone: toZone });
  }
}

export function moveOneCardAction(
  collection: DeckCollection,
  cardId: string,
  fromZone: DeckZone,
  toZone: DeckZone,
  preferredPrintingId: string | null,
  format: DeckFormat,
): void {
  const sourceKey = deckCardKey(cardId, fromZone, preferredPrintingId);
  const source = collection.get(sourceKey);
  if (!source || !isCardAllowedInZone(source, toZone)) {
    return;
  }
  const singleSlot =
    (toZone === WellKnown.deckZone.LEGEND || toZone === WellKnown.deckZone.CHAMPION) &&
    format !== WellKnown.deckFormat.FREEFORM;
  if (singleSlot) {
    moveIntoSingleSlot(collection, source, sourceKey, toZone);
    return;
  }
  if (source.quantity > 1) {
    collection.update(sourceKey, (draft) => {
      draft.quantity -= 1;
    });
  } else {
    collection.delete(sourceKey);
  }

  const targetKey = deckCardKey(cardId, toZone, preferredPrintingId);
  const target = collection.get(targetKey);
  if (target) {
    collection.update(targetKey, (draft) => {
      draft.quantity += 1;
    });
  } else {
    collection.insert({ ...source, zone: toZone, quantity: 1 });
  }
}

/**
 * Sets the row's quantity to an absolute value, or deletes it if <=0. When
 * preferredPrintingId is undefined, operates on the default-art row first.
 */
export function setQuantityAction(
  collection: DeckCollection,
  cardId: string,
  zone: DeckZone,
  quantity: number,
  preferredPrintingId?: string | null,
): void {
  const target =
    preferredPrintingId === undefined
      ? findRowForCardInZone(allCards(collection), cardId, zone)
      : collection.get(deckCardKey(cardId, zone, preferredPrintingId));
  if (!target) {
    return;
  }
  const key = deckCardKey(target.cardId, target.zone, target.preferredPrintingId);
  if (quantity <= 0) {
    collection.delete(key);
    return;
  }
  collection.update(key, (draft) => {
    draft.quantity = quantity;
  });
}

/** When countToConvert equals the source row's full quantity, the source row is removed. */
export function changePreferredPrintingAction(
  collection: DeckCollection,
  cardId: string,
  zone: DeckZone,
  fromPrintingId: string | null,
  toPrintingId: string | null,
  countToConvert: number,
): void {
  if (fromPrintingId === toPrintingId) {
    return;
  }
  const sourceKey = deckCardKey(cardId, zone, fromPrintingId);
  const source = collection.get(sourceKey);
  if (!source) {
    return;
  }
  const take = Math.max(1, Math.min(countToConvert, source.quantity));

  if (take >= source.quantity) {
    collection.delete(sourceKey);
  } else {
    collection.update(sourceKey, (draft) => {
      draft.quantity -= take;
    });
  }

  const targetKey = deckCardKey(cardId, zone, toPrintingId);
  const target = collection.get(targetKey);
  if (target) {
    collection.update(targetKey, (draft) => {
      draft.quantity += take;
    });
  } else {
    collection.insert({ ...source, quantity: take, preferredPrintingId: toPrintingId });
  }
}

export function setLegendAction(
  collection: DeckCollection,
  card: DeckBuilderCard,
  runesByDomain: Map<string, DeckBuilderCard[]>,
  format: DeckFormat,
): void {
  if (format === WellKnown.deckFormat.FREEFORM) {
    // Freeform: legends are a multi-card zone, no rune autofill or domain swap.
    incrementOrInsert(collection, card, WellKnown.deckZone.LEGEND, card.preferredPrintingId, 1);
    return;
  }
  const cards = allCards(collection);

  for (const existing of cards) {
    if (existing.zone === WellKnown.deckZone.LEGEND) {
      collection.delete(
        deckCardKey(existing.cardId, WellKnown.deckZone.LEGEND, existing.preferredPrintingId),
      );
    }
  }
  collection.insert({
    ...card,
    zone: WellKnown.deckZone.LEGEND,
    quantity: 1,
    preferredPrintingId: card.preferredPrintingId,
  });

  // Drop runes that don't match the new legend's domains.
  const legendDomainSet = new Set(card.domains);
  const runesAfter = allCards(collection).filter(
    (entry) => entry.zone === WellKnown.deckZone.RUNES,
  );
  const incompatibleRunes = runesAfter.filter(
    (entry) => !entry.domains.every((domain) => legendDomainSet.has(domain)),
  );
  for (const rune of incompatibleRunes) {
    collection.delete(deckCardKey(rune.cardId, WellKnown.deckZone.RUNES, rune.preferredPrintingId));
  }

  // Auto-populate: distribute 6 slots per domain, grouping by cardId so each
  // unique rune gets a single entry.
  const remainingRunes = allCards(collection).filter(
    (entry) => entry.zone === WellKnown.deckZone.RUNES,
  );
  if (remainingRunes.length > 0 || card.domains.length < 2) {
    return;
  }

  const runeEntries = new Map<string, DeckBuilderCard>();
  const fillDomain = (domain: string, target: number): void => {
    const runes = runesByDomain.get(domain) ?? [];
    if (runes.length === 0) {
      return;
    }
    let remaining = target;
    let index = 0;
    while (remaining > 0) {
      const rune = runes[index % runes.length];
      const already = runeEntries.get(rune.cardId);
      if (already) {
        already.quantity += 1;
      } else {
        runeEntries.set(rune.cardId, {
          ...rune,
          zone: WellKnown.deckZone.RUNES,
          quantity: 1,
          preferredPrintingId: null,
        });
      }
      remaining -= 1;
      index += 1;
    }
  };
  fillDomain(card.domains[0], 6);
  fillDomain(card.domains[1], 6);
  for (const rune of runeEntries.values()) {
    collection.insert(rune);
  }
}

interface DeckBuilderActions {
  addCard: (card: DeckBuilderCard, zone?: DeckZone, count?: number) => void;
  removeCard: (cardId: string, zone: DeckZone, preferredPrintingId?: string | null) => void;
  moveCard: (
    cardId: string,
    fromZone: DeckZone,
    toZone: DeckZone,
    preferredPrintingId: string | null,
  ) => void;
  moveOneCard: (
    cardId: string,
    fromZone: DeckZone,
    toZone: DeckZone,
    preferredPrintingId: string | null,
  ) => void;
  setQuantity: (
    cardId: string,
    zone: DeckZone,
    quantity: number,
    preferredPrintingId?: string | null,
  ) => void;
  changePreferredPrinting: (
    cardId: string,
    zone: DeckZone,
    fromPrintingId: string | null,
    toPrintingId: string | null,
    countToConvert: number,
  ) => void;
  setLegend: (card: DeckBuilderCard, runesByDomain?: Map<string, DeckBuilderCard[]>) => void;
}

export function useDeckBuilderActions(deckId: string): DeckBuilderActions {
  const collection = useDeckDraftCollection(deckId);
  const runesByDomain = useDeckBuilderUiStore((state) => state.runesByDomain);
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);
  const { data: deckDetail } = useDeckDetail(deckId);
  const format = deckDetail.deck.format;

  // Mid-sign-out the collection briefly goes null while React commits the
  // unmount of this route; make all actions no-ops in that window.
  if (!collection) {
    // oxlint-disable-next-line typescript/no-empty-function -- intentional no-op stand-ins while the collection is null
    const noop = (): void => {};
    const noopActions: DeckBuilderActions = {
      addCard: noop,
      removeCard: noop,
      moveCard: noop,
      moveOneCard: noop,
      setQuantity: noop,
      changePreferredPrinting: noop,
      setLegend: noop,
    };
    return noopActions;
  }

  // Snapshot the deck before each edit so undo restores the state the user is
  // about to leave; every card mutation in the app routes through here.
  const record = () => {
    useDeckUndoStore.getState().record(deckId, allCards(collection));
  };

  return {
    addCard: (card, zone, count) => {
      const target = zone ?? activeZone;
      if (!target) {
        return;
      }
      record();
      addCardAction(collection, card, target, count, runesByDomain, format);
    },
    removeCard: (cardId, zone, preferredPrintingId) => {
      record();
      removeCardAction(collection, cardId, zone, runesByDomain, format, preferredPrintingId);
    },
    moveCard: (cardId, from, to, preferredPrintingId) => {
      record();
      moveCardAction(collection, cardId, from, to, preferredPrintingId, format);
    },
    moveOneCard: (cardId, from, to, preferredPrintingId) => {
      record();
      moveOneCardAction(collection, cardId, from, to, preferredPrintingId, format);
    },
    setQuantity: (cardId, zone, quantity, preferredPrintingId) => {
      record();
      setQuantityAction(collection, cardId, zone, quantity, preferredPrintingId);
    },
    changePreferredPrinting: (cardId, zone, fromPrintingId, toPrintingId, countToConvert) => {
      record();
      changePreferredPrintingAction(
        collection,
        cardId,
        zone,
        fromPrintingId,
        toPrintingId,
        countToConvert,
      );
    },
    setLegend: (card, rbd) => {
      record();
      setLegendAction(collection, card, rbd ?? runesByDomain, format);
    },
  };
}

export function useDeckCards(deckId: string): DeckBuilderCard[] {
  const collection = useDeckDraftCollection(deckId);
  const { data } = useLiveQuery({
    query: (q) => (collection ? q.from({ card: collection }) : null),
  });
  return data ?? EMPTY_CARDS;
}

export function useDeckViolations(
  deckId: string,
  format: DeckFormat,
  formatConfig: DeckFormatConfig | null,
): DeckViolation[] {
  const cards = useDeckCards(deckId);
  const customTagAssignments = useCustomTagAssignments();
  const championIdentifierTags = useChampionIdentifierTags();
  return validateDeck({
    format,
    formatConfig,
    cards: cards.map((card) => toRuleEngineCard(card, customTagAssignments)),
    championIdentifierTags,
  });
}
