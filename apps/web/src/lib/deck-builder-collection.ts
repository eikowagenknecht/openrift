// Deck-builder draft: the user's in-progress edits for a single deck, held
// as a per-(QueryClient × userId × deckId) LocalOnlyCollection. Writes are
// applied synchronously to the collection (optimistic), and a 1s-debounced
// handler ships the full card set to the server via `saveDeckCardsFn`. The
// save status (dirty / saving / error) is exposed to React via
// `useDeckSaveStatus`.
//
// Drafts are user-scoped: when the active user changes, every draft from
// the previous user is evicted from the cache and `cleanupWhenIdle` runs
// cleanup() the moment its subscriberCount transitions to 0 — reactive
// teardown, no polling, no [Live Query Error] warnings.

import type { DeckDetailResponse } from "@openrift/shared";
import type { Collection } from "@tanstack/react-db";
import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";

import { saveDeckCardsFn } from "@/hooks/use-decks";
import { useUserId } from "@/lib/auth-session";
import { cleanupWhenIdle, markOrphaned } from "@/lib/collection-cleanup";
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

interface CacheEntry {
  userId: string;
  drafts: Map<string, DraftEntry>;
}

const cache = new WeakMap<QueryClient, CacheEntry>();

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

async function runSave(queryClient: QueryClient, userId: string, entry: DraftEntry): Promise<void> {
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

    queryClient.setQueryData<DeckDetailResponse>(
      queryKeys.decks.detail(userId, entry.deckId),
      (old) => (old ? { ...old, cards: result.cards } : old),
    );
    // Aggregate stats on the deck list (type counts, domain distribution)
    // need refreshing. Detail cache is already up-to-date; don't refetch it.
    void queryClient.invalidateQueries({ queryKey: queryKeys.decks.all(userId), exact: true });

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

function scheduleSave(queryClient: QueryClient, userId: string, entry: DraftEntry): void {
  if (entry.suppressSave) {
    return;
  }
  setStatus(entry, { isDirty: true, error: null });
  if (entry.saveTimer) {
    clearTimeout(entry.saveTimer);
  }
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null;
    void runSave(queryClient, userId, entry);
  }, SAVE_DEBOUNCE_MS);
}

function createEntry(queryClient: QueryClient, userId: string, deckId: string): DraftEntry {
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
      id: `deck-draft:${userId}:${deckId}`,
      getKey: getDeckCardKey,
      // Handler types require a Promise return, but the save is fire-and-
      // forget (debounced inside scheduleSave). `Promise.resolve()` satisfies
      // the type without forcing async keyword + the require-await lint rule.
      onInsert: () => {
        scheduleSave(queryClient, userId, entry);
        return Promise.resolve();
      },
      onUpdate: () => {
        scheduleSave(queryClient, userId, entry);
        return Promise.resolve();
      },
      onDelete: () => {
        scheduleSave(queryClient, userId, entry);
        return Promise.resolve();
      },
    }),
  );

  return entry;
}

function getDraftsForUser(queryClient: QueryClient, userId: string): Map<string, DraftEntry> {
  const existing = cache.get(queryClient);
  if (existing && existing.userId === userId) {
    return existing.drafts;
  }
  if (existing) {
    // User changed: orphan every previous-user draft and schedule reactive
    // cleanup. Local-only collections don't auto-GC (gcTime: 0), so without
    // this they would leak indefinitely.
    for (const [draftDeckId, draft] of existing.drafts) {
      if (draft.saveTimer) {
        clearTimeout(draft.saveTimer);
        draft.saveTimer = null;
      }
      draft.saveController?.abort();
      draft.saveController = null;
      markOrphaned(draft.collection, `deck-draft:${existing.userId}:${draftDeckId}`);
      cleanupWhenIdle(draft.collection);
    }
  }
  const entry: CacheEntry = { userId, drafts: new Map() };
  cache.set(queryClient, entry);
  return entry.drafts;
}

export function getDeckDraftCollection(
  queryClient: QueryClient,
  userId: string,
  deckId: string,
): Collection<DeckBuilderCard, string | number> {
  const drafts = getDraftsForUser(queryClient, userId);
  let entry = drafts.get(deckId);
  if (!entry) {
    entry = createEntry(queryClient, userId, deckId);
    drafts.set(deckId, entry);
  }
  return entry.collection;
}

function getOrCreateEntry(queryClient: QueryClient, userId: string, deckId: string): DraftEntry {
  const drafts = getDraftsForUser(queryClient, userId);
  let entry = drafts.get(deckId);
  if (!entry) {
    entry = createEntry(queryClient, userId, deckId);
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
  userId: string,
  deckId: string,
  cards: DeckBuilderCard[],
): void {
  const entry = getOrCreateEntry(queryClient, userId, deckId);

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

/**
 * Hook variant: returns the current user's draft collection for the given
 * deck, or null when no one is signed in. Live-query consumers should
 * include the result in their dependency array so the live query
 * re-subscribes when the user (or deckId) changes.
 *
 * @returns The current user's draft collection for `deckId`, or null when signed out.
 */
export function useDeckDraftCollection(
  deckId: string,
): Collection<DeckBuilderCard, string | number> | null {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMemo(
    () => (userId ? getDeckDraftCollection(queryClient, userId, deckId) : null),
    [queryClient, userId, deckId],
  );
}

export function useDeckSaveStatus(
  queryClient: QueryClient,
  userId: string,
  deckId: string,
): DeckSaveStatus {
  return useSyncExternalStore(
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- external-store subscribe signature
    (listener) => {
      const entry = getOrCreateEntry(queryClient, userId, deckId);
      entry.subscribers.add(listener);
      return () => entry.subscribers.delete(listener);
    },
    () => {
      const cached = cache.get(queryClient);
      if (!cached || cached.userId !== userId) {
        return CLEAN_STATUS;
      }
      return cached.drafts.get(deckId)?.status ?? CLEAN_STATUS;
    },
    () => CLEAN_STATUS,
  );
}
