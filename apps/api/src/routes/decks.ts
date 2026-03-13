import type { DeckZone } from "@openrift/shared";
import {
  createDeckSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
} from "@openrift/shared/schemas";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { createCrudRoute } from "../crud-factory.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { toDeck } from "../utils/dto.js";

export const decksRoute = createCrudRoute({
  path: "/decks",
  table: "decks",
  toDto: toDeck,
  createSchema: createDeckSchema,
  updateSchema: updateDeckSchema,
  toInsert: (body) => ({
    name: body.name,
    description: body.description ?? null,
    format: body.format,
    is_wanted: body.isWanted ?? false,
    is_public: body.isPublic ?? false,
  }),
  patchFields: {
    name: "name",
    description: "description",
    format: "format",
    isWanted: "is_wanted",
    isPublic: "is_public",
  },
  listFilter: (query, c) => {
    if (c.req.query("wanted") === "true") {
      return query.where("is_wanted", "=", true);
    }
    return query;
  },
  skip: ["getOne"],
});

// ── GET /decks/:id ────────────────────────────────────────────────────────────
// Returns deck with deck_cards joined

decksRoute.get("/decks/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const deck = await db
    .selectFrom("decks")
    .selectAll()
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!deck) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  const cardRows = await db
    .selectFrom("deck_cards as dc")
    .innerJoin("cards as c", "c.id", "dc.card_id")
    .select([
      "dc.id",
      "dc.deck_id",
      "dc.card_id",
      "dc.zone",
      "dc.quantity",
      "c.name as card_name",
      "c.type as card_type",
      "c.domains",
      "c.energy",
      "c.might",
      "c.power",
    ])
    .where("dc.deck_id", "=", id)
    .orderBy("dc.zone")
    .orderBy("c.name")
    .execute();

  return c.json({
    deck: toDeck(deck),
    cards: cardRows.map((r) => ({
      id: r.id,
      deckId: r.deck_id,
      cardId: r.card_id,
      zone: r.zone as DeckZone,
      quantity: r.quantity,
      cardName: r.card_name,
      cardType: r.card_type,
      domains: r.domains,
      energy: r.energy,
      might: r.might,
      power: r.power,
    })),
  });
});

// ── PUT /decks/:id/cards ──────────────────────────────────────────────────────
// Full replace of deck cards

decksRoute.put("/decks/:id/cards", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = updateDeckCardsSchema.parse(await c.req.json());

  // Verify deck belongs to user
  const deck = await db
    .selectFrom("decks")
    .select(["id", "format"])
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!deck) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  // Validate format rules
  if (deck.format === "standard") {
    const mainCount = body.cards
      .filter((entry) => entry.zone === "main")
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const sideboardCount = body.cards
      .filter((entry) => entry.zone === "sideboard")
      .reduce((sum, entry) => sum + entry.quantity, 0);

    if (mainCount < 40) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Standard format requires at least 40 main deck cards",
      );
    }
    if (sideboardCount > 8) {
      throw new AppError(400, "BAD_REQUEST", "Standard format allows at most 8 sideboard cards");
    }
  }

  await db.transaction().execute(async (trx) => {
    // Delete existing cards
    await trx.deleteFrom("deck_cards").where("deck_id", "=", id).execute();

    // Insert new cards
    if (body.cards.length > 0) {
      await trx
        .insertInto("deck_cards")
        .values(
          body.cards.map((card) => ({
            deck_id: id,
            card_id: card.cardId,
            zone: card.zone,
            quantity: card.quantity,
          })),
        )
        .execute();
    }

    // Touch deck updated_at
    await trx.updateTable("decks").set({ updated_at: new Date() }).where("id", "=", id).execute();
  });

  return c.json({ ok: true });
});

// ── GET /decks/:id/availability ───────────────────────────────────────────────
// For a wanted deck, returns per-card availability from deckbuilding collections

decksRoute.get("/decks/:id/availability", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const deck = await db
    .selectFrom("decks")
    .select("id")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!deck) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  // Get deck card requirements
  const deckCards = await db
    .selectFrom("deck_cards")
    .select(["card_id", "zone", "quantity"])
    .where("deck_id", "=", id)
    .execute();

  // Get available copies per card (from deckbuilding-available collections)
  const availableCopies = await db
    .selectFrom("copies as cp")
    .innerJoin("collections as col", "col.id", "cp.collection_id")
    .innerJoin("printings as p", "p.id", "cp.printing_id")
    .select(["p.card_id", db.fn.countAll<number>().as("count")])
    .where("cp.user_id", "=", userId)
    .where("col.available_for_deckbuilding", "=", true)
    .groupBy("p.card_id")
    .execute();

  const ownedByCard = new Map<string, number>();
  for (const row of availableCopies) {
    ownedByCard.set(row.card_id, Number(row.count));
  }

  const availability = deckCards.map((dc) => ({
    cardId: dc.card_id,
    zone: dc.zone,
    needed: dc.quantity,
    owned: ownedByCard.get(dc.card_id) ?? 0,
    shortfall: Math.max(0, dc.quantity - (ownedByCard.get(dc.card_id) ?? 0)),
  }));

  return c.json(availability);
});
