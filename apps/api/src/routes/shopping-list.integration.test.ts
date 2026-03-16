import { describe, expect, it } from "bun:test";

import { CARD_CALM_UNIT, CARD_FURY_UNIT } from "../test/fixtures/constants.js";
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
});
