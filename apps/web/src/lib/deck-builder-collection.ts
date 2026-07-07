// Deck-builder draft, LOCAL-deck backend (ADR-035 browser-local decks): the
// in-progress edits for a `local:` deck, held as a per-(QueryClient × deckId)
// LocalOnlyCollection. Writes apply synchronously to the collection
// (optimistic), and a 1s-debounced handler writes the full card set through to
// `local-decks-store` (localStorage). There is no network anywhere in this
// path, which is why it has no save sequencing, no abort controllers, and no
// error retry: the write-through is synchronous and cannot race.
//
// SERVER decks do not pass through here — they read the synced deck-cards
// shape and write via the offline outbox (see deck-builder-synced.ts);
// hooks/use-deck-builder.ts picks the backend per deck via `isLocalDeckId`.

import type { Collection } from "@tanstack/react-db";
import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import type { DeckSaveStatus } from "@/lib/deck-builder-synced";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";

const SAVE_DEBOUNCE_MS = 1000;

const CLEAN_STATUS: DeckSaveStatus = { isSaving: false, isDirty: false, error: null };

interface DraftEntry {
  deckId: string;
  collection: Collection<DeckBuilderCard, string | number>;
  status: DeckSaveStatus;
  subscribers: Set<() => void>;
  /** Timer handle for the pending debounced write-through. */
  saveTimer: ReturnType<typeof setTimeout> | null;
  /** While true, mutation handlers skip scheduling a save (used during hydration). */
  suppressSave: boolean;
}

// Local drafts are account-independent by design (ADR-035: local decks belong
// to the browser, not to a user), so the cache needs no user-change eviction —
// one drafts map per QueryClient for the lifetime of the page.
const cache = new WeakMap<QueryClient, Map<string, DraftEntry>>();

function notify(entry: DraftEntry): void {
  for (const listener of entry.subscribers) {
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- sync store subscribers
    listener();
  }
}

function setStatus(entry: DraftEntry, partial: Partial<DeckSaveStatus>): void {
  const next = { ...entry.status, ...partial };
  if (
    next.isSaving === entry.status.isSaving &&
    next.isDirty === entry.status.isDirty &&
    next.error === entry.status.error
  ) {
    return;
  }
  entry.status = next;
  notify(entry);
}

// Write the full card set into `local-decks-store`. Synchronous, so no abort /
// sequencing dance is needed — the debounce in `scheduleSave` already coalesces
// rapid edits.
function runLocalSave(entry: DraftEntry): void {
  useLocalDecksStore.getState().setCards(
    entry.deckId,
    [...entry.collection.values()].map((card) => ({
      cardId: card.cardId,
      zone: card.zone,
      quantity: card.quantity,
      preferredPrintingId: card.preferredPrintingId,
    })),
  );
  // A fresh edit may have re-armed the timer while we wrote; keep dirty if so.
  setStatus(entry, { isSaving: false, isDirty: entry.saveTimer !== null, error: null });
}

function scheduleSave(entry: DraftEntry): void {
  if (entry.suppressSave) {
    return;
  }
  setStatus(entry, { isDirty: true, error: null });
  if (entry.saveTimer) {
    clearTimeout(entry.saveTimer);
  }
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null;
    runLocalSave(entry);
  }, SAVE_DEBOUNCE_MS);
}

function createEntry(deckId: string): DraftEntry {
  const entry: DraftEntry = {
    deckId,
    collection: null as unknown as Collection<DeckBuilderCard, string | number>,
    status: CLEAN_STATUS,
    subscribers: new Set(),
    saveTimer: null,
    suppressSave: false,
  };

  entry.collection = createCollection(
    localOnlyCollectionOptions<DeckBuilderCard>({
      id: `deck-draft:local:${deckId}`,
      getKey: getDeckCardKey,
      // Handler types require a Promise return, but the save is fire-and-
      // forget (debounced inside scheduleSave). `Promise.resolve()` satisfies
      // the type without forcing async keyword + the require-await lint rule.
      onInsert: () => {
        scheduleSave(entry);
        return Promise.resolve();
      },
      onUpdate: () => {
        scheduleSave(entry);
        return Promise.resolve();
      },
      onDelete: () => {
        scheduleSave(entry);
        return Promise.resolve();
      },
    }),
  );

  return entry;
}

function getOrCreateEntry(queryClient: QueryClient, deckId: string): DraftEntry {
  let drafts = cache.get(queryClient);
  if (!drafts) {
    drafts = new Map();
    cache.set(queryClient, drafts);
  }
  let entry = drafts.get(deckId);
  if (!entry) {
    entry = createEntry(deckId);
    drafts.set(deckId, entry);
  }
  return entry;
}

/**
 * The local deck's draft collection. Only meaningful for `local:` deck ids;
 * exported for tests and the hook below.
 *
 * @returns The draft collection backing `deckId`.
 */
export function getDeckDraftCollection(
  queryClient: QueryClient,
  deckId: string,
): Collection<DeckBuilderCard, string | number> {
  return getOrCreateEntry(queryClient, deckId).collection;
}

/**
 * Replace the draft's contents with the authoritative stored state. Used on
 * deck load to seed the draft from the local-decks-store entry (shaped like a
 * deck detail response). Cancels any pending debounced write-through since the
 * new state came from the store and doesn't need to be written back.
 */
export function hydrateDeckDraft(
  queryClient: QueryClient,
  deckId: string,
  cards: DeckBuilderCard[],
): void {
  const entry = getOrCreateEntry(queryClient, deckId);

  if (entry.saveTimer) {
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
  }

  const existingKeys = new Set<string | number>();
  for (const key of entry.collection.keys()) {
    existingKeys.add(key);
  }
  const incomingKeys = new Set<string | number>(cards.map((card) => getDeckCardKey(card)));

  entry.suppressSave = true;
  try {
    for (const key of existingKeys) {
      if (!incomingKeys.has(key)) {
        entry.collection.delete(key);
      }
    }
    for (const card of cards) {
      const key = getDeckCardKey(card);
      if (existingKeys.has(key)) {
        entry.collection.update(key, (draft) => {
          draft.quantity = card.quantity;
          draft.cardName = card.cardName;
          draft.cardType = card.cardType;
          draft.superTypes = card.superTypes;
          draft.domains = card.domains;
          draft.tags = card.tags;
          draft.keywords = card.keywords;
          draft.energy = card.energy;
          draft.might = card.might;
          draft.power = card.power;
        });
      } else {
        entry.collection.insert(card);
      }
    }
  } finally {
    entry.suppressSave = false;
  }

  setStatus(entry, { isSaving: false, isDirty: false, error: null });
}

/**
 * Hook variant: the draft collection for a local deck, or null for a server
 * deck (whose cards come from the synced deck-cards shape instead). Live-query
 * consumers should include the result in their dependency array so the live
 * query re-subscribes when the deck changes.
 *
 * @returns The draft collection for `deckId`, or null for server decks.
 */
export function useDeckDraftCollection(
  deckId: string,
): Collection<DeckBuilderCard, string | number> | null {
  const queryClient = useQueryClient();
  const isLocal = isLocalDeckId(deckId);
  return useMemo(
    () => (isLocal ? getDeckDraftCollection(queryClient, deckId) : null),
    [queryClient, isLocal, deckId],
  );
}

// Stable no-op unsubscribe for the server-deck (non-local) subscribe path.
// oxlint-disable-next-line no-empty-function -- intentional no-op unsubscribe
const noop = (): void => {};

/**
 * Hook: a local deck's save status (dirty while the debounce window is open,
 * clean once the write-through lands). Returns a clean status for server
 * decks — their status comes from the outbox via `useSyncedDeckSaveStatus`.
 *
 * @returns The save status for `deckId`.
 */
export function useLocalDeckSaveStatus(deckId: string): DeckSaveStatus {
  const queryClient = useQueryClient();
  const isLocal = isLocalDeckId(deckId);
  return useSyncExternalStore(
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- external-store subscribe signature
    (listener) => {
      if (!isLocal) {
        return noop;
      }
      const entry = getOrCreateEntry(queryClient, deckId);
      entry.subscribers.add(listener);
      return () => entry.subscribers.delete(listener);
    },
    () => (isLocal ? (cache.get(queryClient)?.get(deckId)?.status ?? CLEAN_STATUS) : CLEAN_STATUS),
    () => CLEAN_STATUS,
  );
}
