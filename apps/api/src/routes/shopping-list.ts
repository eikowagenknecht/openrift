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

  // 1. Get available copies per card (from deckbuilding-available collections)
  const ownedRows = await db
    .selectFrom("copies as cp")
    .innerJoin("collections as col", "col.id", "cp.collection_id")
    .innerJoin("printings as p", "p.id", "cp.printing_id")
    .select(["p.card_id", "cp.printing_id", db.fn.countAll<number>().as("count")])
    .where("cp.user_id", "=", userId)
    .where("col.available_for_deckbuilding", "=", true)
    .groupBy(["p.card_id", "cp.printing_id"])
    .execute();

  const ownedByCard = new Map<string, number>();
  const ownedByPrinting = new Map<string, number>();
  for (const row of ownedRows) {
    ownedByCard.set(row.card_id, (ownedByCard.get(row.card_id) ?? 0) + Number(row.count));
    ownedByPrinting.set(row.printing_id, Number(row.count));
  }

  // 2. Deck requirements (wanted decks)
  const deckDemands: {
    source: string;
    sourceId: string;
    sourceName: string;
    cardId: string;
    needed: number;
  }[] = [];

  const wantedDecks = await db
    .selectFrom("decks")
    .select(["id", "name"])
    .where("user_id", "=", userId)
    .where("is_wanted", "=", true)
    .execute();

  if (wantedDecks.length > 0) {
    const deckCards = await db
      .selectFrom("deck_cards")
      .select(["deck_id", "card_id", "quantity"])
      .where(
        "deck_id",
        "in",
        wantedDecks.map((d) => d.id),
      )
      .execute();

    const deckNames = new Map(wantedDecks.map((d) => [d.id, d.name]));

    for (const dc of deckCards) {
      deckDemands.push({
        source: "deck",
        sourceId: dc.deck_id,
        sourceName: deckNames.get(dc.deck_id) ?? "",
        cardId: dc.card_id,
        needed: dc.quantity,
      });
    }
  }

  // 3. Wish list manual items
  const wishDemands: {
    source: string;
    sourceId: string;
    sourceName: string;
    cardId: string | null;
    printingId: string | null;
    needed: number;
  }[] = [];

  const wishLists = await db
    .selectFrom("wish_lists")
    .select(["id", "name"])
    .where("user_id", "=", userId)
    .execute();

  if (wishLists.length > 0) {
    const wishItems = await db
      .selectFrom("wish_list_items")
      .select(["wish_list_id", "card_id", "printing_id", "quantity_desired"])
      .where(
        "wish_list_id",
        "in",
        wishLists.map((w) => w.id),
      )
      .execute();

    const wishNames = new Map(wishLists.map((w) => [w.id, w.name]));

    for (const item of wishItems) {
      wishDemands.push({
        source: "wish_list",
        sourceId: item.wish_list_id,
        sourceName: wishNames.get(item.wish_list_id) ?? "",
        cardId: item.card_id,
        printingId: item.printing_id,
        needed: item.quantity_desired,
      });
    }
  }

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
