import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";

const ctx = createDbContext("a0000000-0193-4000-a000-000000000001");

/**
 * Migration 193 (ADR-037 hardening): the deferred constraint triggers that
 * guarantee every card keeps at least one `card_card_types` row and that the
 * denormalized `cards.type` scalar tracks the position-0 slug. An empty type
 * set would violate the non-empty `types` catalog contract and 500 the public
 * catalog, so the database itself must make that state unreachable — even for
 * hand-written SQL that bypasses the repositories.
 */
describe.skipIf(!ctx)("card type junction triggers (integration, migration 193)", () => {
  const { db } = ctx!;

  const createdSlugs = ["TRG193-BARE", "TRG193-MULTI"];

  afterAll(async () => {
    // card_card_types rows cascade with the card
    await db.deleteFrom("cards").where("slug", "in", createdSlugs).execute();
  });

  it("seeds the junction from cards.type when a bare INSERT skips it", async () => {
    const [card] = await db
      .insertInto("cards")
      .values({
        slug: "TRG193-BARE",
        name: "Trigger Bare Card",
        type: "unit",
        might: null,
        energy: null,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .execute();

    const junction = await db
      .selectFrom("cardCardTypes")
      .select(["typeSlug", "position"])
      .where("cardId", "=", card.id)
      .execute();
    expect(junction).toEqual([{ typeSlug: "unit", position: 0 }]);
  });

  it("does not double-seed when card and junction are written in one transaction", async () => {
    const cardId = await db.transaction().execute(async (trx) => {
      const [card] = await trx
        .insertInto("cards")
        .values({
          slug: "TRG193-MULTI",
          name: "Trigger Unit Gear",
          type: "unit",
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          keywords: [],
          tags: [],
        })
        .returning("id")
        .execute();
      await trx
        .insertInto("cardCardTypes")
        .values([
          { cardId: card.id, typeSlug: "unit", position: 0 },
          { cardId: card.id, typeSlug: "gear", position: 1 },
        ])
        .execute();
      return card.id;
    });

    const junction = await db
      .selectFrom("cardCardTypes")
      .select("typeSlug")
      .where("cardId", "=", cardId)
      .orderBy("position")
      .execute();
    expect(junction.map((row) => row.typeSlug)).toEqual(["unit", "gear"]);
  });

  it("rejects a transaction that leaves a card with zero junction rows", async () => {
    const card = await db
      .selectFrom("cards")
      .select("id")
      .where("slug", "=", "TRG193-BARE")
      .executeTakeFirstOrThrow();

    await expect(
      db.deleteFrom("cardCardTypes").where("cardId", "=", card.id).execute(),
    ).rejects.toThrow(/at least one card_card_types row/u);

    // The rejected delete must have rolled back
    const junction = await db
      .selectFrom("cardCardTypes")
      .select("typeSlug")
      .where("cardId", "=", card.id)
      .execute();
    expect(junction).toHaveLength(1);
  });

  it("re-syncs cards.type to the position-0 slug on a replace flow", async () => {
    const card = await db
      .selectFrom("cards")
      .select("id")
      .where("slug", "=", "TRG193-MULTI")
      .executeTakeFirstOrThrow();

    // Delete-then-insert like replaceCardTypesById, but WITHOUT updating the
    // scalar — the trigger must bring it along.
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("cardCardTypes").where("cardId", "=", card.id).execute();
      await trx
        .insertInto("cardCardTypes")
        .values([
          { cardId: card.id, typeSlug: "gear", position: 0 },
          { cardId: card.id, typeSlug: "unit", position: 1 },
        ])
        .execute();
    });

    const row = await db
      .selectFrom("cards")
      .select("type")
      .where("id", "=", card.id)
      .executeTakeFirstOrThrow();
    expect(row.type).toBe("gear");
  });

  it("lets a card delete cascade without a false rejection", async () => {
    const [card] = await db
      .insertInto("cards")
      .values({
        slug: "TRG193-CASCADE",
        name: "Trigger Cascade Card",
        type: "spell",
        might: null,
        energy: null,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .execute();

    await db.deleteFrom("cards").where("id", "=", card.id).execute();

    const orphaned = await sql<{ count: number }>`
      SELECT count(*)::int AS count FROM card_card_types WHERE card_id = ${card.id}
    `.execute(db);
    expect(orphaned.rows[0].count).toBe(0);
  });
});
