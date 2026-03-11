import type { Deck, DeckFormat, DeckZone } from "@openrift/shared";
import {
  createDeckSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
} from "@openrift/shared/schemas";
import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getUserId } from "../middleware/get-user-id.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAuth } from "../middleware/require-auth.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const decksRoute = new Hono<{ Variables: Variables }>();

decksRoute.use("/decks/*", requireAuth);
decksRoute.use("/decks", requireAuth);

function toDeck(row: {
  id: string;
  name: string;
  description: string | null;
  format: string;
  is_wanted: boolean;
  is_public: boolean;
  share_token: string | null;
  created_at: Date;
  updated_at: Date;
}): Deck {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    format: row.format as DeckFormat,
    isWanted: row.is_wanted,
    isPublic: row.is_public,
    shareToken: row.share_token,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ── GET /decks ────────────────────────────────────────────────────────────────

decksRoute.get("/decks", async (c) => {
  const userId = getUserId(c);
  const wantedOnly = c.req.query("wanted") === "true";

  let query = db.selectFrom("decks").selectAll().where("user_id", "=", userId).orderBy("name");

  if (wantedOnly) {
    query = query.where("is_wanted", "=", true);
  }

  const rows = await query.execute();
  return c.json(rows.map((row) => toDeck(row)));
});

// ── POST /decks ───────────────────────────────────────────────────────────────

decksRoute.post("/decks", async (c) => {
  const userId = getUserId(c);
  const body = createDeckSchema.parse(await c.req.json());

  const id = crypto.randomUUID();
  const row = await db
    .insertInto("decks")
    .values({
      id,
      user_id: userId,
      name: body.name,
      description: body.description ?? null,
      format: body.format,
      is_wanted: body.isWanted ?? false,
      is_public: body.isPublic ?? false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return c.json(toDeck(row), 201);
});

// ── GET /decks/:id ────────────────────────────────────────────────────────────

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

// ── PATCH /decks/:id ──────────────────────────────────────────────────────────

decksRoute.patch("/decks/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = updateDeckSchema.parse(await c.req.json());

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    updates.name = body.name;
  }
  if (body.description !== undefined) {
    updates.description = body.description;
  }
  if (body.format !== undefined) {
    updates.format = body.format;
  }
  if (body.isWanted !== undefined) {
    updates.is_wanted = body.isWanted;
  }
  if (body.isPublic !== undefined) {
    updates.is_public = body.isPublic;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, "BAD_REQUEST", "No fields to update");
  }

  updates.updated_at = new Date();

  const row = await db
    .updateTable("decks")
    .set(updates)
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json(toDeck(row));
});

// ── DELETE /decks/:id ─────────────────────────────────────────────────────────

decksRoute.delete("/decks/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const result = await db
    .deleteFrom("decks")
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, "NOT_FOUND", "Not found");
  }

  return c.json({ ok: true });
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
            id: crypto.randomUUID(),
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
