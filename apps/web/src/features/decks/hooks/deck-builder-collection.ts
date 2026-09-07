import type { DeckDetailResponse } from "@openrift/shared/types/api/deck";
import type { Collection } from "@tanstack/react-db";
import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { cleanupWhenIdle, markOrphaned } from "@/features/collections/lib/collection-cleanup";
import { saveDeckCardsFn } from "@/features/decks/hooks/use-decks";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { getDeckCardKey } from "@/features/decks/lib/deck-builder-card";
import { isLocalDeckId } from "@/features/decks/lib/local-deck";
import { useDeckUndoStore } from "@/features/decks/stores/deck-undo-store";
import { useLocalDecksStore } from "@/features/decks/stores/local-decks-store";
import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withTimeout } from "@/lib/with-timeout";

const LOCAL_SCOPE = "local";

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
  saveTimer: ReturnType<typeof setTimeout> | null;
  saveController: AbortController | null;
  saveSeq: number;
  lastAppliedSeq: number;
  suppressSave: boolean;
  hydrated: boolean;
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

function collectionCards(entry: DraftEntry): {
  cardId: string;
  zone: DeckBuilderCard["zone"];
  quantity: number;
  preferredPrintingId: string | null;
}[] {
  return [...entry.collection.values()].map((card) => ({
    cardId: card.cardId,
    zone: card.zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
  }));
}

function runLocalSave(entry: DraftEntry): void {
  useLocalDecksStore.getState().setCards(entry.deckId, collectionCards(entry));
  setStatus(entry, { isSaving: false, isDirty: entry.saveTimer !== null, error: null });
}

async function runSave(queryClient: QueryClient, userId: string, entry: DraftEntry): Promise<void> {
  if (isLocalDeckId(entry.deckId)) {
    runLocalSave(entry);
    return;
  }

  entry.saveController?.abort();
  const controller = new AbortController();
  entry.saveController = controller;
  const seq = ++entry.saveSeq;

  const cards = collectionCards(entry);

  setStatus(entry, { isSaving: true, error: null });

  try {
    const result = await withTimeout(
      saveDeckCardsFn({ data: { deckId: entry.deckId, cards }, signal: controller.signal }),
      { label: "Save deck cards", abortController: controller },
    );

    if (seq < entry.lastAppliedSeq || controller.signal.aborted) {
      return;
    }
    entry.lastAppliedSeq = seq;

    queryClient.setQueryData<DeckDetailResponse>(
      queryKeys.decks.detail(userId, entry.deckId),
      (old) => (old ? { ...old, cards: result.cards } : old),
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.decks.all(userId), exact: true });

    const stillDirty = entry.saveTimer !== null;
    setStatus(entry, { isSaving: false, isDirty: stillDirty, error: null });
  } catch (error) {
    if (controller.signal.aborted && seq < entry.saveSeq) {
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
    hydrated: false,
  };

  entry.collection = createCollection(
    localOnlyCollectionOptions<DeckBuilderCard>({
      id: `deck-draft:${userId}:${deckId}`,
      getKey: getDeckCardKey,
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
    // Local-only collections don't auto-GC (gcTime: 0); orphan and clean up
    // every previous-user draft here or they leak indefinitely.
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

function replaceDraftCards(entry: DraftEntry, cards: DeckBuilderCard[]): void {
  const existingKeys = new Set<string | number>();
  for (const key of entry.collection.keys()) {
    existingKeys.add(key);
  }
  const incomingKeys = new Set<string | number>(cards.map((card) => getDeckCardKey(card)));

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
}

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

  entry.suppressSave = true;
  try {
    replaceDraftCards(entry, cards);
  } finally {
    entry.suppressSave = false;
  }

  setStatus(entry, { isSaving: false, isDirty: false, error: null });

  if (!entry.hydrated) {
    entry.hydrated = true;
    notify(entry);
  }

  useDeckUndoStore.getState().reset(deckId);
}

export function useDeckDraftHydrated(
  queryClient: QueryClient,
  userId: string,
  deckId: string,
): boolean {
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
        return false;
      }
      return cached.drafts.get(deckId)?.hydrated ?? false;
    },
    () => false,
  );
}

export function applyDeckSnapshot(
  queryClient: QueryClient,
  userId: string,
  deckId: string,
  cards: DeckBuilderCard[],
): void {
  replaceDraftCards(getOrCreateEntry(queryClient, userId, deckId), cards);
}

export function useDeckDraftCollection(
  deckId: string,
): Collection<DeckBuilderCard, string | number> | null {
  const queryClient = useQueryClient();
  const scope = useDeckDraftScope(deckId);
  return scope ? getDeckDraftCollection(queryClient, scope, deckId) : null;
}

export function useDeckDraftScope(deckId: string): string | null {
  const userId = useUserId();
  return isLocalDeckId(deckId) ? LOCAL_SCOPE : userId;
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
