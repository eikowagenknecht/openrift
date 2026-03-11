import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAuth } from "../middleware/require-auth.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const shoppingListRoute = new Hono<{ Variables: Variables }>();

shoppingListRoute.use("/shopping-list", requireAuth);

// ── GET /shopping-list ────────────────────────────────────────────────────────
// Unified "still needed" view: wanted deck shortfalls + wish list items

shoppingListRoute.get("/shopping-list", async (c) => {
  const userId = getUserId(c);

  // Run all three independent queries in parallel
  const [ownedRows, deckCardRows, wishItemRows] = await Promise.all([
    // 1. Available copies per card (from deckbuilding-available collections)
    db
      .selectFrom("copies as cp")
      .innerJoin("collections as col", "col.id", "cp.collection_id")
      .innerJoin("printings as p", "p.id", "cp.printing_id")
      .select(["p.card_id", "cp.printing_id", db.fn.countAll<number>().as("count")])
      .where("cp.user_id", "=", userId)
      .where("col.available_for_deckbuilding", "=", true)
      .groupBy(["p.card_id", "cp.printing_id"])
      .execute(),

    // 2. Deck requirements (wanted decks joined with their cards)
    db
      .selectFrom("deck_cards as dc")
      .innerJoin("decks as d", "d.id", "dc.deck_id")
      .select(["d.id as deck_id", "d.name as deck_name", "dc.card_id", "dc.quantity"])
      .where("d.user_id", "=", userId)
      .where("d.is_wanted", "=", true)
      .execute(),

    // 3. Wish list items (wish lists joined with their items)
    db
      .selectFrom("wish_list_items as wi")
      .innerJoin("wish_lists as wl", "wl.id", "wi.wish_list_id")
      .select([
        "wl.id as wish_list_id",
        "wl.name as wish_list_name",
        "wi.card_id",
        "wi.printing_id",
        "wi.quantity_desired",
      ])
      .where("wl.user_id", "=", userId)
      .execute(),
  ]);

  const ownedByCard = new Map<string, number>();
  const ownedByPrinting = new Map<string, number>();
  for (const row of ownedRows) {
    ownedByCard.set(row.card_id, (ownedByCard.get(row.card_id) ?? 0) + Number(row.count));
    ownedByPrinting.set(row.printing_id, Number(row.count));
  }

  const deckDemands = deckCardRows.map((dc) => ({
    source: "deck" as const,
    sourceId: dc.deck_id,
    sourceName: dc.deck_name,
    cardId: dc.card_id,
    needed: dc.quantity,
  }));

  const wishDemands = wishItemRows.map((item) => ({
    source: "wish_list" as const,
    sourceId: item.wish_list_id,
    sourceName: item.wish_list_name,
    cardId: item.card_id,
    printingId: item.printing_id,
    needed: item.quantity_desired,
  }));

  // 4. Aggregate total demand per card
  const demandByCard = new Map<string, number>();

  for (const d of deckDemands) {
    demandByCard.set(d.cardId, (demandByCard.get(d.cardId) ?? 0) + d.needed);
  }

  for (const d of wishDemands) {
    if (d.cardId) {
      demandByCard.set(d.cardId, (demandByCard.get(d.cardId) ?? 0) + d.needed);
    }
  }

  // Per-printing wish demands are separate (not aggregated by card)
  const demandByPrinting = new Map<string, number>();
  for (const d of wishDemands) {
    if (d.printingId) {
      demandByPrinting.set(d.printingId, (demandByPrinting.get(d.printingId) ?? 0) + d.needed);
    }
  }

  // 5. Build result
  const items: {
    cardId: string | null;
    printingId: string | null;
    totalDemand: number;
    owned: number;
    stillNeeded: number;
    sources: { source: string; sourceId: string; sourceName: string; needed: number }[];
  }[] = [];

  // Card-level demands
  for (const [cardId, totalDemand] of demandByCard) {
    const owned = ownedByCard.get(cardId) ?? 0;
    const stillNeeded = Math.max(0, totalDemand - owned);

    const sources = [
      ...deckDemands.filter((d) => d.cardId === cardId),
      ...wishDemands.filter((d) => d.cardId === cardId),
    ].map((d) => ({
      source: d.source,
      sourceId: d.sourceId,
      sourceName: d.sourceName,
      needed: d.needed,
    }));

    items.push({ cardId, printingId: null, totalDemand, owned, stillNeeded, sources });
  }

  // Printing-level demands
  for (const [printingId, totalDemand] of demandByPrinting) {
    const owned = ownedByPrinting.get(printingId) ?? 0;
    const stillNeeded = Math.max(0, totalDemand - owned);

    const sources = wishDemands
      .filter((d) => d.printingId === printingId)
      .map((d) => ({
        source: d.source,
        sourceId: d.sourceId,
        sourceName: d.sourceName,
        needed: d.needed,
      }));

    items.push({ cardId: null, printingId, totalDemand, owned, stillNeeded, sources });
  }

  // Sort by stillNeeded desc, then by card/printing
  items.sort((a, b) => b.stillNeeded - a.stillNeeded);

  return c.json({ items });
});
