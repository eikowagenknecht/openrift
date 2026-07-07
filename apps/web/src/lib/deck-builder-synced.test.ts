import type { Card } from "@openrift/shared";
import type { OfflineExecutor } from "@tanstack/offline-transactions";
import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetIdCounter,
  stubCard,
  stubDeckBuilderCard,
  stubDeckCardShapeRow,
} from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { deckSaveKey, useDeckSaveStatusStore } from "../stores/deck-save-status-store";
import { createDeckDraft, deckCardsFromShapeRows, SAVE_DEBOUNCE_MS } from "./deck-builder-synced";
import type { DeckCardShapeRow, DeckCardsWriteCollection } from "./decks-offline";

const resetStatusStore = createStoreResetter(useDeckSaveStatusStore);

const USER_ID = "user-a";
const DECK_ID = "deck-1";

// Catalog lookup: two known cards, everything else missing.
const CARDS_BY_ID: Record<string, Card> = {
  "card-1": stubCard({ name: "Card One", type: "unit" }),
  "card-2": stubCard({ name: "Card Two", type: "spell" }),
};

function createShapeCollection(initial: DeckCardShapeRow[] = []): DeckCardsWriteCollection {
  return createCollection(
    localOnlyCollectionOptions<DeckCardShapeRow>({
      id: `test-deck-cards-${Math.random().toString(36).slice(2)}`,
      getKey: (row) => row.id,
      initialData: initial,
    }),
  ) as unknown as DeckCardsWriteCollection;
}

interface FakeTx {
  mutate: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
}

/**
 * Builds a fake offline executor whose transactions apply mutations
 * synchronously (mirroring TanStack DB's optimistic apply) and record their
 * commits.
 *
 * @returns The executor plus introspection handles for assertions.
 */
function createFakeExecutor(options?: { online?: boolean; commitImpl?: () => Promise<unknown> }): {
  executor: OfflineExecutor;
  txs: FakeTx[];
} {
  const txs: FakeTx[] = [];
  const executor = {
    isOnline: () => options?.online ?? true,
    createOfflineTransaction: () => {
      const inner = {
        mutate: vi.fn((callback: () => void) => {
          callback();
          return inner;
        }),
      };
      const tx: FakeTx = {
        mutate: vi.fn((callback: () => void) => {
          callback();
          return inner;
        }),
        commit: vi.fn(() => (options?.commitImpl ? options.commitImpl() : Promise.resolve())),
      };
      txs.push(tx);
      return tx;
    },
  };
  return { executor: executor as unknown as OfflineExecutor, txs };
}

function draftFor(
  collection: DeckCardsWriteCollection,
  executor: OfflineExecutor,
  deckId = DECK_ID,
) {
  return createDeckDraft({
    collection,
    executor,
    userId: USER_ID,
    deckId,
    cardsById: CARDS_BY_ID,
  });
}

function statusOf(deckId = DECK_ID) {
  return useDeckSaveStatusStore.getState().statuses[deckSaveKey(USER_ID, deckId)];
}

let collection: DeckCardsWriteCollection;

beforeEach(() => {
  vi.useFakeTimers();
  resetIdCounter();
  collection = createShapeCollection();
});

afterEach(() => {
  resetStatusStore();
  void (collection as unknown as { cleanup: () => Promise<void> }).cleanup();
  vi.useRealTimers();
});

describe("createDeckDraft writes", () => {
  it("insert creates a shape row with a client-generated uuid and snake_case fields", () => {
    const { executor } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    draft.insert(
      stubDeckBuilderCard({
        cardId: "card-1",
        zone: "main",
        quantity: 2,
        preferredPrintingId: "print-9",
      }),
    );

    const rows = [...collection.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      deck_id: DECK_ID,
      card_id: "card-1",
      zone: "main",
      quantity: 2,
      preferred_printing_id: "print-9",
    });
    expect(rows[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/u);
  });

  it("update writes only the quantity back to the row", () => {
    const row = stubDeckCardShapeRow({ id: "row-1", card_id: "card-1", quantity: 1 });
    collection = createShapeCollection([row]);
    const { executor } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    draft.update("card-1|main|", (card) => {
      card.quantity += 2;
    });

    expect(collection.get("row-1")?.quantity).toBe(3);
  });

  it("update is a no-op when the quantity is unchanged", () => {
    const row = stubDeckCardShapeRow({ id: "row-1", card_id: "card-1", quantity: 2 });
    collection = createShapeCollection([row]);
    const { executor, txs } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    draft.update("card-1|main|", (card) => {
      card.cardName = "Renamed";
    });

    expect(txs).toHaveLength(0);
    expect(statusOf()).toBeUndefined();
  });

  it("delete removes the row by content key", () => {
    const row = stubDeckCardShapeRow({ id: "row-1", card_id: "card-1" });
    collection = createShapeCollection([row]);
    const { executor } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    draft.delete("card-1|main|");

    expect(collection.size).toBe(0);
  });

  it("update and delete ignore unknown content keys", () => {
    const { executor, txs } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    draft.update("missing|main|", (card) => {
      card.quantity = 5;
    });
    draft.delete("missing|main|");

    expect(txs).toHaveLength(0);
  });
});

describe("createDeckDraft reads", () => {
  it("materializes rows for this deck only, via the catalog", () => {
    collection = createShapeCollection([
      stubDeckCardShapeRow({ id: "row-1", card_id: "card-1", deck_id: DECK_ID, quantity: 3 }),
      stubDeckCardShapeRow({ id: "row-2", card_id: "card-2", deck_id: "other-deck" }),
    ]);
    const { executor } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    const cards = [...draft.values()];
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ cardId: "card-1", cardName: "Card One", quantity: 3 });
    expect(draft.get("card-1|main|")?.quantity).toBe(3);
    expect(draft.get("card-2|main|")).toBeUndefined();
  });

  it("drops rows whose card is missing from the catalog", () => {
    collection = createShapeCollection([
      stubDeckCardShapeRow({ id: "row-1", card_id: "unknown-card" }),
    ]);
    const { executor } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    expect([...draft.values()]).toHaveLength(0);
  });
});

describe("debounced save window", () => {
  it("batches rapid edits into one transaction and commits once after the debounce", async () => {
    const { executor, txs } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    draft.insert(stubDeckBuilderCard({ cardId: "card-1", zone: "main" }));
    draft.update("card-1|main|", (card) => {
      card.quantity += 1;
    });

    expect(txs).toHaveLength(1);
    expect(statusOf()?.state).toBe("dirty");
    expect(txs[0].commit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(txs[0].commit).toHaveBeenCalledTimes(1);
    expect(statusOf()?.state).toBe("saved");
  });

  it("each edit resets the debounce timer", async () => {
    const { executor, txs } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    draft.insert(stubDeckBuilderCard({ cardId: "card-1", zone: "main" }));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 100);
    draft.update("card-1|main|", (card) => {
      card.quantity += 1;
    });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 100);
    expect(txs[0].commit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(txs[0].commit).toHaveBeenCalledTimes(1);
  });

  it("edits after a commit open a fresh transaction", async () => {
    const { executor, txs } = createFakeExecutor();
    const draft = draftFor(collection, executor);

    draft.insert(stubDeckBuilderCard({ cardId: "card-1", zone: "main" }));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    draft.update("card-1|main|", (card) => {
      card.quantity += 1;
    });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(txs).toHaveLength(2);
    expect(txs[1].commit).toHaveBeenCalledTimes(1);
  });

  it("separate decks get separate windows", () => {
    const { executor, txs } = createFakeExecutor();
    const draftA = draftFor(collection, executor, "deck-1");
    const draftB = draftFor(collection, executor, "deck-2");

    const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main" });
    draftA.insert(card);
    draftB.insert(card);

    expect(txs).toHaveLength(2);
  });

  it("reports an error when the commit fails permanently", async () => {
    const { executor } = createFakeExecutor({
      commitImpl: () => Promise.reject(new Error("rejected by server")),
    });
    const draft = draftFor(collection, executor);

    draft.insert(stubDeckBuilderCard({ cardId: "card-1", zone: "main" }));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(statusOf()?.state).toBe("error");
    expect(statusOf()?.error?.message).toBe("rejected by server");
  });

  it("settles as queued while offline — the outbox owns the write", async () => {
    const { executor, txs } = createFakeExecutor({
      online: false,
      // Offline commit never resolves within the window.
      // oxlint-disable-next-line promise/avoid-new -- a never-settling promise is the point
      commitImpl: () => new Promise(() => {}),
    });
    const draft = draftFor(collection, executor);

    draft.insert(stubDeckBuilderCard({ cardId: "card-1", zone: "main" }));
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(txs[0].commit).toHaveBeenCalledTimes(1);
    expect(statusOf()?.state).toBe("queued");
  });
});

describe("deckCardsFromShapeRows", () => {
  it("maps rows through the catalog and drops unknown cards", () => {
    const cards = deckCardsFromShapeRows(
      [
        stubDeckCardShapeRow({ id: "row-1", card_id: "card-1", zone: "main", quantity: 2 }),
        stubDeckCardShapeRow({ id: "row-2", card_id: "unknown", zone: "main" }),
      ],
      CARDS_BY_ID,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ cardId: "card-1", cardName: "Card One", quantity: 2 });
  });

  it("returns empty for no rows", () => {
    expect(deckCardsFromShapeRows([], CARDS_BY_ID)).toEqual([]);
  });

  it("dedupes rows sharing a content key (last row wins)", () => {
    const cards = deckCardsFromShapeRows(
      [
        stubDeckCardShapeRow({ id: "row-1", card_id: "card-1", zone: "main", quantity: 1 }),
        stubDeckCardShapeRow({ id: "row-2", card_id: "card-1", zone: "main", quantity: 3 }),
      ],
      CARDS_BY_ID,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].quantity).toBe(3);
  });

  it("keeps distinct printings of the same card as separate rows", () => {
    const cards = deckCardsFromShapeRows(
      [
        stubDeckCardShapeRow({ id: "row-1", card_id: "card-1", zone: "main" }),
        stubDeckCardShapeRow({
          id: "row-2",
          card_id: "card-1",
          zone: "main",
          preferred_printing_id: "print-1",
        }),
      ],
      CARDS_BY_ID,
    );
    expect(cards).toHaveLength(2);
  });
});
