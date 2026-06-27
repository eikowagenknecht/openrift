// Deck-builder write path (ADR-027 decks vertical): deck edits operate on a
// thin draft facade over the synced deck-cards shape. Each edit applies
// optimistically to the Electric collection through an open offline
// transaction; a 1s debounce window batches rapid edits into one transaction,
// whose commit durably persists the batch to the per-user outbox and
// dispatches it to the row-level apply endpoint. The outbox replays FIFO, so
// out-of-order saves are structurally impossible — the old saveSeq /
// lastAppliedSeq counters, the abort-superseded-request controller, and the
// hydrate-into-draft diff are all gone; the synced collection IS the state.
//
// Save status is derived from the transaction lifecycle (dirty while the
// debounce window is open, saving while a committed transaction awaits
// confirmation, queued once it is durably parked in the outbox) and lives in
// the deck-save-status store.

import type { Card } from "@openrift/shared";
import type { OfflineExecutor } from "@tanstack/offline-transactions";
import type { Transaction } from "@tanstack/react-db";

import { useUserId } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey, toDeckBuilderCard } from "@/lib/deck-builder-card";
import type { DeckCardShapeRow, DeckCardsWriteCollection } from "@/lib/decks-offline";
import { createOfflineTx, settleForFeedback } from "@/lib/offline-feedback";
import type { OfflineTxLike } from "@/lib/offline-feedback";
import { uuidv7 } from "@/lib/uuidv7";
import { deckSaveKey, useDeckSaveStatusStore } from "@/stores/deck-save-status-store";

export const SAVE_DEBOUNCE_MS = 1000;

export interface DeckSaveStatus {
  isSaving: boolean;
  isDirty: boolean;
  error: Error | null;
}

const CLEAN_STATUS: DeckSaveStatus = { isSaving: false, isDirty: false, error: null };
const DIRTY_STATUS: DeckSaveStatus = { isSaving: false, isDirty: true, error: null };
const SAVING_STATUS: DeckSaveStatus = { isSaving: true, isDirty: false, error: null };

/**
 * The write/read surface the deck-builder actions operate on: DeckBuilderCard
 * rows keyed by the content key (cardId|zone|preferredPrintingId). A plain
 * TanStack DB collection of DeckBuilderCard satisfies this structurally, which
 * is what the action unit tests drive it with.
 */
export interface DeckDraft {
  get: (key: string | number) => DeckBuilderCard | undefined;
  values: () => Iterable<DeckBuilderCard>;
  insert: (card: DeckBuilderCard) => void;
  update: (key: string | number, callback: (draft: DeckBuilderCard) => void) => void;
  delete: (key: string | number) => void;
}

// ── Debounced save windows ───────────────────────────────────────────────────
//
// One open offline transaction per (executor, deckId): the first edit creates
// it, further edits within the debounce window join it via the underlying
// TanStack DB transaction's `mutate` (optimistic state applies instantly),
// and the timer commits it as a single outbox record. Module-level so the
// window survives re-renders and route changes; keyed by the executor, whose
// identity is already per (queryClient, userId).

interface DeckSaveWindow {
  offlineTx: OfflineTxLike<DeckCardShapeRow> | null;
  innerTx: Transaction<DeckCardShapeRow> | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** Committed transactions still settling — keeps "saved" from firing early. */
  inFlight: number;
}

const windowsByExecutor = new WeakMap<OfflineExecutor, Map<string, DeckSaveWindow>>();

function getWindow(executor: OfflineExecutor, deckId: string): DeckSaveWindow {
  let windows = windowsByExecutor.get(executor);
  if (!windows) {
    windows = new Map();
    windowsByExecutor.set(executor, windows);
  }
  let window = windows.get(deckId);
  if (!window) {
    window = { offlineTx: null, innerTx: null, timer: null, inFlight: 0 };
    windows.set(deckId, window);
  }
  return window;
}

function commitWindow(executor: OfflineExecutor, statusKey: string, window: DeckSaveWindow): void {
  const tx = window.offlineTx;
  if (!tx) {
    return;
  }
  window.offlineTx = null;
  window.innerTx = null;
  window.inFlight += 1;
  useDeckSaveStatusStore.getState().markSaving(statusKey);

  void (async () => {
    let outcome: "synced" | "queued";
    try {
      outcome = await settleForFeedback(tx.commit(), executor);
    } catch (error) {
      window.inFlight -= 1;
      // Newer edits own the status from here.
      if (window.offlineTx || window.timer || window.inFlight > 0) {
        return;
      }
      useDeckSaveStatusStore
        .getState()
        .markError(statusKey, error instanceof Error ? error : new Error(String(error)));
      return;
    }
    window.inFlight -= 1;
    if (window.offlineTx || window.timer || window.inFlight > 0) {
      return;
    }
    useDeckSaveStatusStore.getState().markSettled(statusKey, outcome);
  })();
}

function enqueueDeckMutation(
  executor: OfflineExecutor,
  userId: string,
  deckId: string,
  mutate: () => void,
): void {
  const window = getWindow(executor, deckId);
  const statusKey = deckSaveKey(userId, deckId);
  if (window.offlineTx && window.innerTx) {
    window.innerTx.mutate(mutate);
  } else {
    const offlineTx = createOfflineTx<DeckCardShapeRow>(executor, "applyDeckCards");
    window.innerTx = offlineTx.mutate(mutate);
    window.offlineTx = offlineTx;
  }
  useDeckSaveStatusStore.getState().markDirty(statusKey);
  if (window.timer) {
    clearTimeout(window.timer);
  }
  window.timer = setTimeout(() => {
    window.timer = null;
    commitWindow(executor, statusKey, window);
  }, SAVE_DEBOUNCE_MS);
}

// ── Shape row ⇄ builder card mapping ────────────────────────────────────────

function shapeRowToBuilderCard(
  row: DeckCardShapeRow,
  cardsById: Record<string, Card>,
): DeckBuilderCard | null {
  return toDeckBuilderCard(
    {
      cardId: row.card_id,
      zone: row.zone,
      quantity: row.quantity,
      preferredPrintingId: row.preferred_printing_id,
    },
    cardsById,
  );
}

/**
 * Materializes synced deck-card shape rows into DeckBuilderCards via the
 * catalog. Rows whose card is missing from the catalog are dropped (matching
 * the old hydrate behavior). Deduped by content key, last row wins — two rows
 * can share a content key only in the transient window where an optimistic
 * row and a server-merged row (different ids, same content) briefly coexist.
 *
 * @returns The deck's cards in DeckBuilderCard form.
 */
export function deckCardsFromShapeRows(
  rows: readonly DeckCardShapeRow[],
  cardsById: Record<string, Card>,
): DeckBuilderCard[] {
  const byKey = new Map<string, DeckBuilderCard>();
  for (const row of rows) {
    const card = shapeRowToBuilderCard(row, cardsById);
    if (!card) {
      continue;
    }
    byKey.set(getDeckCardKey(card), card);
  }
  return [...byKey.values()];
}

export interface DeckDraftOptions {
  collection: DeckCardsWriteCollection;
  executor: OfflineExecutor;
  userId: string;
  deckId: string;
  cardsById: Record<string, Card>;
}

/**
 * The deck-builder's draft facade over the synced deck-cards shape: reads
 * materialize the deck's shape rows (synced state plus optimistic overlays)
 * into DeckBuilderCards, writes translate content-keyed operations into
 * row-level mutations on the shape collection routed through the debounced
 * offline-transaction window. Stateless — safe to recreate per render; the
 * open save window lives module-level keyed by the executor.
 *
 * Note: `update` honors only quantity changes. Zone and printing are part of
 * the content key, so the actions express moves as delete + insert.
 *
 * @returns The draft facade for `deckId`.
 */
export function createDeckDraft(options: DeckDraftOptions): DeckDraft {
  const { collection, executor, userId, deckId, cardsById } = options;

  // Fresh index per call: optimistic mutations apply synchronously, and the
  // actions interleave reads with writes (e.g. legend swap then rune refill),
  // so a cached index would go stale mid-action. Decks are small.
  const rowsByKey = (): Map<string, DeckCardShapeRow> => {
    const map = new Map<string, DeckCardShapeRow>();
    for (const row of collection.values()) {
      if (row.deck_id !== deckId) {
        continue;
      }
      // Last row wins on a (transient) content-key collision — see
      // deckCardsFromShapeRows.
      map.set(deckCardKeyOfRow(row), row);
    }
    return map;
  };

  const enqueue = (mutate: () => void) => enqueueDeckMutation(executor, userId, deckId, mutate);

  return {
    get(key) {
      const row = rowsByKey().get(String(key));
      return row ? (shapeRowToBuilderCard(row, cardsById) ?? undefined) : undefined;
    },
    values() {
      const cards: DeckBuilderCard[] = [];
      for (const row of rowsByKey().values()) {
        const card = shapeRowToBuilderCard(row, cardsById);
        if (card) {
          cards.push(card);
        }
      }
      return cards;
    },
    insert(card) {
      const row: DeckCardShapeRow = {
        id: uuidv7(),
        deck_id: deckId,
        card_id: card.cardId,
        zone: card.zone,
        quantity: card.quantity,
        preferred_printing_id: card.preferredPrintingId,
      };
      enqueue(() => {
        collection.insert(row);
      });
    },
    update(key, mutator) {
      const row = rowsByKey().get(String(key));
      if (!row) {
        return;
      }
      const card = shapeRowToBuilderCard(row, cardsById);
      if (!card) {
        return;
      }
      const draft = { ...card };
      mutator(draft);
      const quantity = draft.quantity;
      if (quantity === row.quantity) {
        return;
      }
      enqueue(() => {
        collection.update(row.id, (rowDraft) => {
          rowDraft.quantity = quantity;
        });
      });
    },
    delete(key) {
      const row = rowsByKey().get(String(key));
      if (!row) {
        return;
      }
      enqueue(() => {
        collection.delete(row.id);
      });
    },
  };
}

function deckCardKeyOfRow(row: DeckCardShapeRow): string {
  return getDeckCardKey({
    cardId: row.card_id,
    zone: row.zone,
    preferredPrintingId: row.preferred_printing_id,
  });
}

/**
 * Hook: the current deck's save status, derived from the offline-transaction
 * lifecycle. `isDirty` while edits sit in the uncommitted debounce window,
 * `isSaving` while a committed transaction awaits server confirmation. A
 * write parked durably in the outbox ("queued") reports neither — it survives
 * tab closes and replays in the background.
 *
 * @returns The save status for `deckId`, clean when signed out or untouched.
 */
export function useDeckSaveStatus(deckId: string): DeckSaveStatus {
  const userId = useUserId();
  const entry = useDeckSaveStatusStore((state) =>
    userId ? state.statuses[deckSaveKey(userId, deckId)] : undefined,
  );
  if (!entry || entry.state === "saved" || entry.state === "queued") {
    return CLEAN_STATUS;
  }
  if (entry.state === "dirty") {
    return DIRTY_STATUS;
  }
  if (entry.state === "saving") {
    return SAVING_STATUS;
  }
  return { isSaving: false, isDirty: false, error: entry.error };
}
