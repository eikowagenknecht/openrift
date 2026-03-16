import { describe, expect, it } from "bun:test";

import {
  CARD_CALM_UNIT,
  CARD_FURY_UNIT,
  PRINTING_1,
  PRINTING_4,
} from "../test/fixtures/constants.js";
import { createTestContext, req } from "../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Shopping List route
//
// Uses the shared integration database with pre-seeded OGS card data.
// Only auth is mocked.
// ---------------------------------------------------------------------------

const ctx = createTestContext("a0000000-0007-4000-a000-000000000001");

describe.skipIf(!ctx)("Shopping List route (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  it("returns empty items when user has no wanted decks or wish lists", async () => {
    const res = await app.fetch(req("GET", "/shopping-list"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items).toBeDefined();
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items).toHaveLength(0);
  });

  it("includes wish list items in shopping list", async () => {
    // Create a wish list with an item
    const wlRes = await app.fetch(req("POST", "/wish-lists", { name: "Shopping WL" }));
    const wl = (await wlRes.json()) as { id: string };

    await app.fetch(
      req("POST", `/wish-lists/${wl.id}/items`, { cardId: CARD_FURY_UNIT.id, quantityDesired: 2 }),
    );

    const res = await app.fetch(req("GET", "/shopping-list"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items.length).toBeGreaterThanOrEqual(1);
  });

  it("includes wanted deck shortfalls in shopping list", async () => {
    // Create a wanted deck with cards
    const deckRes = await app.fetch(
      req("POST", "/decks", { name: "Wanted Deck", format: "freeform", isWanted: true }),
    );
    const deck = (await deckRes.json()) as { id: string };

    await app.fetch(
      req("PUT", `/decks/${deck.id}/cards`, {
        cards: [{ cardId: CARD_CALM_UNIT.id, zone: "main", quantity: 4 }],
      }),
    );

    const res = await app.fetch(req("GET", "/shopping-list"));
    expect(res.status).toBe(200);

    const json = await res.json();
    // Should include items from both wish list and wanted deck
    expect(json.items.length).toBeGreaterThanOrEqual(2);
  });

  // ── Coverage: lines 70-71 (ownedByCard / ownedByPrinting) ────────────────

  it("subtracts owned copies from demand (ownedByCard path)", async () => {
    // Create a collection (availableForDeckbuilding defaults to true)
    const colRes = await app.fetch(req("POST", "/collections", { name: "SL Owned Col" }));
    const col = (await colRes.json()) as { id: string };

    // Add 2 copies of CARD_MIND_UNIT
    await app.fetch(
      req("POST", "/copies", {
        copies: [
          { printingId: PRINTING_1.id, collectionId: col.id },
          { printingId: PRINTING_1.id, collectionId: col.id },
        ],
      }),
    );

    // Create a wanted deck requiring 4 of that card
    const deckRes = await app.fetch(
      req("POST", "/decks", { name: "SL Owned Deck", format: "freeform", isWanted: true }),
    );
    const deck = (await deckRes.json()) as { id: string };
    await app.fetch(
      req("PUT", `/decks/${deck.id}/cards`, {
        cards: [{ cardId: PRINTING_1.cardId, zone: "main", quantity: 4 }],
      }),
    );

    const res = await app.fetch(req("GET", "/shopping-list"));
    expect(res.status).toBe(200);

    const json = await res.json();
    const item = json.items.find((i: { cardId: string | null }) => i.cardId === PRINTING_1.cardId);
    expect(item).toBeDefined();
    // owned should be >= 2, stillNeeded should be totalDemand - owned
    expect(item.owned).toBeGreaterThanOrEqual(2);
    expect(item.stillNeeded).toBe(Math.max(0, item.totalDemand - item.owned));
  });

  // ── Coverage: lines 108, 135-136, 138-145 (printing-level wish demands) ──

  it("includes printing-level wish list items in shopping list", async () => {
    // Create a wish list with an item by printingId (not cardId)
    const wlRes = await app.fetch(req("POST", "/wish-lists", { name: "SL Printing WL" }));
    const wl = (await wlRes.json()) as { id: string };

    await app.fetch(
      req("POST", `/wish-lists/${wl.id}/items`, {
        printingId: PRINTING_4.id,
        quantityDesired: 3,
      }),
    );

    const res = await app.fetch(req("GET", "/shopping-list"));
    expect(res.status).toBe(200);

    const json = await res.json();
    // Should have a printing-level item (cardId: null, printingId set)
    const printingItem = json.items.find(
      (i: { printingId: string | null }) => i.printingId === PRINTING_4.id,
    );
    expect(printingItem).toBeDefined();
    expect(printingItem.cardId).toBeNull();
    expect(printingItem.totalDemand).toBe(3);
    expect(printingItem.stillNeeded).toBeGreaterThanOrEqual(0);
    expect(printingItem.sources.length).toBeGreaterThanOrEqual(1);
    expect(printingItem.sources[0].source).toBe("wish_list");
  });
});
