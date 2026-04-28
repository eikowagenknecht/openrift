import type { DeckFormat, DeckViolation, DeckZone, Domain } from "@openrift/shared";
import { validateDeck } from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import type { Collection } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { deckCardKey, isCardAllowedInZone } from "@/lib/deck-builder-card";
import { getDeckDraftCollection } from "@/lib/deck-builder-collection";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";

const RUNE_TARGET = 12;
const COPY_LIMIT_ZONES: ReadonlySet<DeckZone> = new Set([
  "main",
  "sideboard",
  "overflow",
  "champion",
]);
const EMPTY_CARDS: DeckBuilderCard[] = [];

type DeckCollection = Collection<DeckBuilderCard, string | number>;

function allCards(collection: DeckCollection): DeckBuilderCard[] {
  return [...collection.values()];
}

function runeTotalOf(cards: DeckBuilderCard[]): number {
  let total = 0;
  for (const card of cards) {
    if (card.zone === "runes") {
      total += card.quantity;
    }
  }
  return total;
}

/**
 * Picks the best row matching (cardId, zone) when the caller didn't specify a
 * printing. Prefers the default-art row (preferredPrintingId === null), so that
 * pinned printings stay sticky when users decrement via the card browser.
 *
 * @returns The chosen row or undefined if no match exists.
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
 * After a rune is added or removed, adjust a rune of the opposite domain so
 * the total stays at RUNE_TARGET. When incrementing and no opposite-domain
 * rune exists in the deck, falls back to the catalog's runesByDomain.
 *
 * Operates directly on the collection — each call issues
 * insert/update/delete on the runes zone.
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

  const legend = cards.find((card) => card.zone === "legend");
  if (!legend || legend.domains.length < 2) {
    return;
  }

  const otherDomain = legend.domains.find((domain) => !changedDomains.includes(domain));
  if (!otherDomain) {
    return;
  }

  if (runeTotal > RUNE_TARGET) {
    const otherRune = cards.find(
      (card) => card.zone === "runes" && card.domains.some((domain) => domain === otherDomain),
    );
    if (!otherRune) {
      return;
    }
    const key = deckCardKey(otherRune.cardId, "runes", otherRune.preferredPrintingId);
    if (otherRune.quantity > 1) {
      collection.update(key, (draft) => {
        draft.quantity -= 1;
      });
    } else {
      collection.delete(key);
    }
    return;
  }

  // Under target — increment an opposite-domain rune already in the deck,
  // or add a fresh one from the catalog.
  const existingOther = cards.find(
    (card) => card.zone === "runes" && card.domains.some((domain) => domain === otherDomain),
  );
  if (existingOther) {
    collection.update(
      deckCardKey(existingOther.cardId, "runes", existingOther.preferredPrintingId),
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
      zone: "runes",
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
 * Returns true when a rune of `card.domains` can be added without leaving the
 * deck above RUNE_TARGET. Below the cap it's always allowed; at the cap an add
 * is only allowed when rebalanceRunes will be able to decrement an
 * opposite-domain rune already in the deck (the legend must be dual-domain,
 * the card mustn't cover both domains, and a rune of the other domain must
 * already exist).
 *
 * @returns Whether incrementing this rune is currently valid.
 */
export function canAddRune(card: DeckBuilderCard, deckCards: DeckBuilderCard[]): boolean {
  const runeTotal = runeTotalOf(deckCards);
  if (runeTotal < RUNE_TARGET) {
    return true;
  }
  const legend = deckCards.find((entry) => entry.zone === "legend");
  if (!legend || legend.domains.length < 2) {
    return false;
  }
  const otherDomain = legend.domains.find((domain) => !card.domains.includes(domain));
  if (!otherDomain) {
    return false;
  }
  return deckCards.some(
    (entry) => entry.zone === "runes" && entry.domains.some((domain) => domain === otherDomain),
  );
}

// ── Action implementations ──────────────────────────────────────────────────

export function addCardAction(
  collection: DeckCollection,
  card: DeckBuilderCard,
  zone: DeckZone,
  count: number | undefined,
  runesByDomain: Map<string, DeckBuilderCard[]>,
): void {
  if (!isCardAllowedInZone(card, zone)) {
    return;
  }
  const preferredPrintingId = card.preferredPrintingId;

  if (zone === "legend" || zone === "champion") {
    // Single-card zones: replace whatever is in the zone, across any printing.
    for (const existing of allCards(collection)) {
      if (existing.zone === zone) {
        collection.delete(deckCardKey(existing.cardId, zone, existing.preferredPrintingId));
      }
    }
    collection.insert({ ...card, zone, quantity: 1, preferredPrintingId });
    return;
  }

  if (zone === "battlefield") {
    const cards = allCards(collection);
    const zoneCards = cards.filter((entry) => entry.zone === "battlefield");
    if (zoneCards.some((entry) => entry.cardId === card.cardId)) {
      return;
    }
    if (zoneCards.length >= 3) {
      return;
    }
    collection.insert({ ...card, zone, quantity: 1, preferredPrintingId });
    return;
  }

  if (zone === "runes") {
    const addQty = count ?? 1;
    for (let step = 0; step < addQty; step++) {
      const cards = allCards(collection);
      if (!canAddRune(card, cards)) {
        break;
      }
      const existing = cards.find(
        (entry) =>
          entry.cardId === card.cardId &&
          entry.zone === "runes" &&
          entry.preferredPrintingId === preferredPrintingId,
      );
      if (existing) {
        collection.update(deckCardKey(card.cardId, "runes", preferredPrintingId), (draft) => {
          draft.quantity += 1;
        });
      } else {
        collection.insert({ ...card, zone: "runes", quantity: 1, preferredPrintingId });
      }
      rebalanceRunes(collection, card.domains, runesByDomain);
    }
    return;
  }

  // Main / sideboard / overflow — enforce cross-zone copy cap of 3.
  const cards = allCards(collection);
  let addQty = count ?? 1;
  if (COPY_LIMIT_ZONES.has(zone)) {
    const total = crossZoneTotal(cards, card.cardId);
    if (total >= 3) {
      return;
    }
    addQty = Math.min(addQty, 3 - total);
  }

  const key = deckCardKey(card.cardId, zone, preferredPrintingId);
  const existing = cards.find(
    (entry) =>
      entry.cardId === card.cardId &&
      entry.zone === zone &&
      entry.preferredPrintingId === preferredPrintingId,
  );
  if (existing) {
    collection.update(key, (draft) => {
      draft.quantity += addQty;
    });
  } else {
    collection.insert({ ...card, zone, quantity: addQty, preferredPrintingId });
  }
}

/**
 * Decrements (or removes) one copy of a card in a zone. When preferredPrintingId
 * is undefined, operates on the default-art row first (or any row if no default
 * exists), so the card browser's minus button leaves pinned printings alone.
 */
export function removeCardAction(
  collection: DeckCollection,
  cardId: string,
  zone: DeckZone,
  runesByDomain: Map<string, DeckBuilderCard[]>,
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
  if (zone === "runes") {
    rebalanceRunes(collection, target.domains, runesByDomain);
  }
}

export function moveCardAction(
  collection: DeckCollection,
  cardId: string,
  fromZone: DeckZone,
  toZone: DeckZone,
  preferredPrintingId: string | null,
): void {
  const sourceKey = deckCardKey(cardId, fromZone, preferredPrintingId);
  const source = collection.get(sourceKey);
  if (!source || !isCardAllowedInZone(source, toZone)) {
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
): void {
  const sourceKey = deckCardKey(cardId, fromZone, preferredPrintingId);
  const source = collection.get(sourceKey);
  if (!source || !isCardAllowedInZone(source, toZone)) {
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

/**
 * Changes the preferred printing of a specific row, optionally splitting off
 * only some copies. When the target printing already has a row at the same
 * (cardId, zone), quantities merge.
 *
 * @param countToConvert - How many copies to move onto the target printing.
 *   When equal to the source row's full quantity, the source row is removed.
 */
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

  // Adjust or remove the source row
  if (take >= source.quantity) {
    collection.delete(sourceKey);
  } else {
    collection.update(sourceKey, (draft) => {
      draft.quantity -= take;
    });
  }

  // Merge into or create the target row
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
): void {
  const cards = allCards(collection);

  // Replace legend slot (across all printings).
  for (const existing of cards) {
    if (existing.zone === "legend") {
      collection.delete(deckCardKey(existing.cardId, "legend", existing.preferredPrintingId));
    }
  }
  collection.insert({
    ...card,
    zone: "legend",
    quantity: 1,
    preferredPrintingId: card.preferredPrintingId,
  });

  // Drop runes that don't match the new legend's domains. Handles both
  // direct swaps and remove-then-add.
  const legendDomainSet = new Set(card.domains);
  const runesAfter = allCards(collection).filter((entry) => entry.zone === "runes");
  const hasIncompatibleRunes = runesAfter.some(
    (entry) => !entry.domains.every((domain) => legendDomainSet.has(domain)),
  );
  if (hasIncompatibleRunes) {
    for (const rune of runesAfter) {
      collection.delete(deckCardKey(rune.cardId, "runes", rune.preferredPrintingId));
    }
  }

  // Auto-populate runes if runes zone is now empty and the legend has two
  // domains. Distribute 6 slots per domain across available rune cards,
  // grouping by cardId so each unique rune gets a single entry.
  const remainingRunes = allCards(collection).filter((entry) => entry.zone === "runes");
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
          zone: "runes",
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

// ── Hooks ───────────────────────────────────────────────────────────────────

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
  const queryClient = useQueryClient();
  const collection = getDeckDraftCollection(queryClient, deckId);
  const runesByDomain = useDeckBuilderUiStore((state) => state.runesByDomain);
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);

  return {
    addCard: (card, zone, count) => {
      const target = zone ?? activeZone;
      if (!target) {
        return;
      }
      addCardAction(collection, card, target, count, runesByDomain);
    },
    removeCard: (cardId, zone, preferredPrintingId) =>
      removeCardAction(collection, cardId, zone, runesByDomain, preferredPrintingId),
    moveCard: (cardId, from, to, preferredPrintingId) =>
      moveCardAction(collection, cardId, from, to, preferredPrintingId),
    moveOneCard: (cardId, from, to, preferredPrintingId) =>
      moveOneCardAction(collection, cardId, from, to, preferredPrintingId),
    setQuantity: (cardId, zone, quantity, preferredPrintingId) =>
      setQuantityAction(collection, cardId, zone, quantity, preferredPrintingId),
    changePreferredPrinting: (cardId, zone, fromPrintingId, toPrintingId, countToConvert) =>
      changePreferredPrintingAction(
        collection,
        cardId,
        zone,
        fromPrintingId,
        toPrintingId,
        countToConvert,
      ),
    setLegend: (card, rbd) => setLegendAction(collection, card, rbd ?? runesByDomain),
  };
}

export function useDeckCards(deckId: string): DeckBuilderCard[] {
  const queryClient = useQueryClient();
  const collection = getDeckDraftCollection(queryClient, deckId);
  const { data } = useLiveQuery((q) => q.from({ card: collection }), [deckId]);
  return data ?? EMPTY_CARDS;
}

export function useDeckViolations(deckId: string, format: DeckFormat): DeckViolation[] {
  const cards = useDeckCards(deckId);
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
      keywords: card.keywords,
    })),
  });
}
