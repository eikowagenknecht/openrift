// Deck-builder draft: the user's in-progress edits for a single deck, held
// as a per-(QueryClient × deckId) LocalOnlyCollection. Writes are applied
// synchronously to the collection (optimistic), and a 1s-debounced handler
// ships the full card set to the server via `saveDeckCardsFn`. The save
// status (dirty / saving / error) is exposed to React via
// `useDeckSaveStatus`.
//
// This replaces the previous `useDeckBuilderStore` Zustand store. Keeping
// drafts in a collection lets consumers use live queries (zone filters,
// violations, stats) in the same shape as server-backed collections.

import type { DeckDetailResponse } from "@openrift/shared";
import type { Collection } from "@tanstack/react-db";
import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { saveDeckCardsFn } from "@/hooks/use-decks";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import { queryKeys } from "@/lib/query-keys";
import { withTimeout } from "@/lib/with-timeout";

const SAVE_DEBOUNCE_MS = 1000;

interface DeckSaveStatus {
  isSaving: boolean;
  isDirty: boolean;
  error: Error | null;
}

const CLEAN_STATUS: DeckSaveStatus = { isSaving: false, isDirty: false, error: null };

interface DraftEntry {
  deckId: string;
  collection: Collection<DeckBuilderCard, string | number>;
  status: DeckSaveStatus;
  subscribers: Set<() => void>;
  /** Timer handle for the pending debounced save. */
  saveTimer: ReturnType<typeof setTimeout> | null;
  /** Controller for the in-flight save; aborted when a newer save starts. */
  saveController: AbortController | null;
  /** Monotonic id — the latest save issued wins cache updates even out of order. */
  saveSeq: number;
  /** Seq of the most recently applied successful save, so stale responses are ignored. */
  lastAppliedSeq: number;
  /** While true, mutation handlers skip scheduling a save (used during hydration). */
  suppressSave: boolean;
}

const cache = new WeakMap<QueryClient, Map<string, DraftEntry>>();

function getDraftsForClient(queryClient: QueryClient): Map<string, DraftEntry> {
  let drafts = cache.get(queryClient);
  if (!drafts) {
    drafts = new Map();
    cache.set(queryClient, drafts);
  }
  return drafts;
}

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

async function runSave(queryClient: QueryClient, entry: DraftEntry): Promise<void> {
  entry.saveController?.abort();
  const controller = new AbortController();
  entry.saveController = controller;
  const seq = ++entry.saveSeq;

  const cards = [...entry.collection.values()].map((card) => ({
    cardId: card.cardId,
    zone: card.zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
  }));

  setStatus(entry, { isSaving: true, error: null });

  try {
    const result = await withTimeout(
      saveDeckCardsFn({ data: { deckId: entry.deckId, cards }, signal: controller.signal }),
      { label: "Save deck cards", abortController: controller },
    );

    // A newer save has started since we sent this request — don't clobber
    // the cache or status with stale data.
    if (seq < entry.lastAppliedSeq || controller.signal.aborted) {
      return;
    }
    entry.lastAppliedSeq = seq;

    queryClient.setQueryData<DeckDetailResponse>(queryKeys.decks.detail(entry.deckId), (old) =>
      old ? { ...old, cards: result.cards } : old,
    );
    // Aggregate stats on the deck list (type counts, domain distribution)
    // need refreshing. Detail cache is already up-to-date; don't refetch it.
    void queryClient.invalidateQueries({ queryKey: queryKeys.decks.all, exact: true });

    // If more edits queued up a fresh save while we were in flight, leave
    // isDirty true — the next debounced save will clear it on success.
    const stillDirty = entry.saveTimer !== null;
    setStatus(entry, { isSaving: false, isDirty: stillDirty, error: null });
  } catch (error) {
    if (controller.signal.aborted && seq < entry.saveSeq) {
      // Superseded by a newer save — swallow the abort; the newer save owns
      // the status.
      return;
    }
    setStatus(entry, {
      isSaving: false,
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

function scheduleSave(queryClient: QueryClient, entry: DraftEntry): void {
  if (entry.suppressSave) {
    return;
  }
  setStatus(entry, { isDirty: true, error: null });
  if (entry.saveTimer) {
    clearTimeout(entry.saveTimer);
  }
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null;
    void runSave(queryClient, entry);
  }, SAVE_DEBOUNCE_MS);
}

function createEntry(queryClient: QueryClient, deckId: string): DraftEntry {
  const entry: DraftEntry = {
    deckId,
    collection: null as unknown as Collection<DeckBuilderCard, string | number>,
    status: CLEAN_STATUS,
    subscribers: new Set(),
    saveTimer: null,
    saveController: null,
    saveSeq: 0,
    lastAppliedSeq: 0,
    suppressSave: false,
  };

  entry.collection = createCollection(
    localOnlyCollectionOptions<DeckBuilderCard>({
      id: `deck-draft-${deckId}`,
      getKey: getDeckCardKey,
      // Handler types require a Promise return, but the save is fire-and-
      // forget (debounced inside scheduleSave). `Promise.resolve()` satisfies
      // the type without forcing async keyword + the require-await lint rule.
      onInsert: () => {
        scheduleSave(queryClient, entry);
        return Promise.resolve();
      },
      onUpdate: () => {
        scheduleSave(queryClient, entry);
        return Promise.resolve();
      },
      onDelete: () => {
        scheduleSave(queryClient, entry);
        return Promise.resolve();
      },
    }),
  );

  return entry;
}

export function getDeckDraftCollection(
  queryClient: QueryClient,
  deckId: string,
): Collection<DeckBuilderCard, string | number> {
  const drafts = getDraftsForClient(queryClient);
  let entry = drafts.get(deckId);
  if (!entry) {
    entry = createEntry(queryClient, deckId);
    drafts.set(deckId, entry);
  }
  return entry.collection;
}

function getOrCreateEntry(queryClient: QueryClient, deckId: string): DraftEntry {
  const drafts = getDraftsForClient(queryClient);
  let entry = drafts.get(deckId);
  if (!entry) {
    entry = createEntry(queryClient, deckId);
    drafts.set(deckId, entry);
  }
  return entry;
}

/**
 * Replace the draft's contents with the authoritative server state. Used on
 * deck load to seed the draft from the loaded deck detail. Cancels any
 * pending/in-flight save since the new state came from the server and
 * doesn't need to be written back.
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
  entry.saveController?.abort();
  entry.saveController = null;

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

// Tear down all per-deck draft collections for this client on auth changes.
// Drafts are LocalOnly (no server sync) but they still hold the previous
// user's in-flight edits and pending save timers in memory. Drop the entire
// drafts map; the next deck-builder mount rebuilds entries from server state.
export function cleanupDeckBuilderCollections(queryClient: QueryClient): void {
  const drafts = cache.get(queryClient);
  if (!drafts) {
    return;
  }
  for (const entry of drafts.values()) {
    if (entry.saveTimer) {
      clearTimeout(entry.saveTimer);
      entry.saveTimer = null;
    }
    entry.saveController?.abort();
    entry.saveController = null;
    void entry.collection.cleanup();
  }
  cache.delete(queryClient);
}

export function useDeckSaveStatus(queryClient: QueryClient, deckId: string): DeckSaveStatus {
  return useSyncExternalStore(
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- external-store subscribe signature
    (listener) => {
      const entry = getOrCreateEntry(queryClient, deckId);
      entry.subscribers.add(listener);
      return () => entry.subscribers.delete(listener);
    },
    () => cache.get(queryClient)?.get(deckId)?.status ?? CLEAN_STATUS,
    () => CLEAN_STATUS,
  );
}
