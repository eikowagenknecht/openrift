import { afterAll, describe, expect, it } from "vitest";

import { createDbContext, refreshCardAggregates } from "../test/integration-context.js";
import { cardTokensRepo } from "./card-tokens.js";

// ---------------------------------------------------------------------------
// Integration tests: card_tokens derivation (migration 228).
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix CTK- for entities it creates.
// ---------------------------------------------------------------------------

const ctx = createDbContext("00000000-0000-4000-a000-0000000000cc");

let setId: string;
let spriteId: string;
let buffId: string;
let summonerId: string;
let plainId: string;
let spritePrintingId: string;

/**
 * Inserts a card. The card-type junction is left to migration 193's trigger,
 * which seeds it from `cards.type` at commit; writing the row here as well
 * collides on `card_card_types_pkey`.
 * @returns The inserted card's id.
 */
async function seedCard(name: string, type: string, normName: string): Promise<string> {
  const [card] = await ctx!.db
    .insertInto("cards")
    .values({ name, slug: normName, type, normName, keywords: [], tags: [] })
    .returning("id")
    .execute();
  return card.id;
}

/** @returns The inserted printing's id. */
async function seedPrinting(
  cardId: string,
  shortCode: string,
  opts: { printedRulesText: string; language?: string },
): Promise<string> {
  const [printing] = await ctx!.db
    .insertInto("printings")
    .values({
      cardId,
      setId,
      shortCode,
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      size: "standard",
      artist: "CTK Artist",
      publicCode: shortCode,
      printedRulesText: opts.printedRulesText,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      language: opts.language ?? "EN",
    })
    .returning("id")
    .execute();
  return printing.id;
}

if (ctx) {
  const { db } = ctx;

  const [set] = await db
    .insertInto("sets")
    .values({ slug: "CTK-TEST", name: "CTK Test Set", printedTotal: 4, sortOrder: 940 })
    .returning("id")
    .execute();
  setId = set.id;

  // The two token cards, one matched by phrase and one by the implicit rule.
  spriteId = await seedCard("Sprite", "unit", "ctk-sprite");
  buffId = await seedCard("Buff", "other", "ctk-buff");
  await db
    .insertInto("cardSuperTypes")
    .values([
      { cardId: spriteId, superTypeSlug: "token" },
      { cardId: buffId, superTypeSlug: "token" },
    ])
    .execute();

  // A card that creates a Sprite, and one that references neither.
  summonerId = await seedCard("CTK Summoner", "unit", "ctk-summoner");
  plainId = await seedCard("CTK Plain", "unit", "ctk-plain");

  spritePrintingId = await seedPrinting(summonerId, "CTK-001", {
    printedRulesText: "Play a 3 :rb_might: Sprite unit token.",
  });
  await seedPrinting(plainId, "CTK-002", { printedRulesText: "Draw a card." });

  afterAll(async () => {
    await db.deleteFrom("printings").where("setId", "=", setId).execute();
    await db
      .deleteFrom("cards")
      .where("id", "in", [spriteId, buffId, summonerId, plainId])
      .execute();
    await db.deleteFrom("sets").where("id", "=", setId).execute();
  });
}

/** @returns Token card ids derived for `cardId`, sorted for stable assertions. */
async function tokensFor(cardId: string): Promise<string[]> {
  const rows = await ctx!.db
    .selectFrom("cardTokens")
    .select("tokenCardId")
    .where("cardId", "=", cardId)
    .execute();
  return rows.map((row) => row.tokenCardId).toSorted();
}

describe.skipIf(!ctx)("cardTokensRepo derivation", () => {
  it("derives a phrase-matched token from printing text", async () => {
    await cardTokensRepo(ctx!.db).recomputeAll();
    expect(await tokensFor(summonerId)).toEqual([spriteId]);
  });

  it("derives nothing for a card whose text names no token", async () => {
    await cardTokensRepo(ctx!.db).recomputeAll();
    expect(await tokensFor(plainId)).toEqual([]);
  });

  it("picks up a printing-text edit on recompute", async () => {
    const repo = cardTokensRepo(ctx!.db);
    await repo.recomputeAll();

    await ctx!.db
      .updateTable("printings")
      .set({ printedRulesText: "Buff a friendly unit." })
      .where("id", "=", spritePrintingId)
      .execute();
    await repo.recomputeForPrintingCard(spritePrintingId);

    // The Sprite reference is gone and the implicit Buff rule now applies.
    expect(await tokensFor(summonerId)).toEqual([buffId]);

    await ctx!.db
      .updateTable("printings")
      .set({ printedRulesText: "Play a 3 :rb_might: Sprite unit token." })
      .where("id", "=", spritePrintingId)
      .execute();
    await repo.recomputeForPrintingCard(spritePrintingId);
    expect(await tokensFor(summonerId)).toEqual([spriteId]);
  });

  it("derives from errata text too, and drops it when the errata goes", async () => {
    const repo = cardTokensRepo(ctx!.db);

    await ctx!.db
      .insertInto("cardErrata")
      .values({
        cardId: plainId,
        correctedRulesText: "Draw a card. Play a Sprite unit token.",
        correctedEffectText: null,
        source: "test",
      })
      .execute();
    await repo.recomputeForCard(plainId);
    expect(await tokensFor(plainId)).toEqual([spriteId]);

    await ctx!.db.deleteFrom("cardErrata").where("cardId", "=", plainId).execute();
    await repo.recomputeForCard(plainId);
    expect(await tokensFor(plainId)).toEqual([]);
  });

  it("leaves manual rows alone while replacing derived ones", async () => {
    const repo = cardTokensRepo(ctx!.db);

    await ctx!.db
      .insertInto("cardTokens")
      .values({ cardId: plainId, tokenCardId: buffId, source: "manual" })
      .execute();
    await repo.recomputeAll();

    expect(await tokensFor(plainId)).toEqual([buffId]);

    await ctx!.db
      .deleteFrom("cardTokens")
      .where("cardId", "=", plainId)
      .where("source", "=", "manual")
      .execute();
  });

  it("publishes the relation through mv_card_aggregates", async () => {
    await cardTokensRepo(ctx!.db).recomputeAll();
    await refreshCardAggregates(ctx!.db);

    const row = await ctx!.db
      .selectFrom("mvCardAggregates")
      .select("tokenCardIds")
      .where("cardId", "=", summonerId)
      .executeTakeFirst();

    expect(row?.tokenCardIds).toEqual([spriteId]);
  });

  it("ignores non-EN printing text", async () => {
    const repo = cardTokensRepo(ctx!.db);

    // FR, not DE: `printings.language` is an FK onto `languages`, and the
    // migrations seed no German row.
    await seedPrinting(plainId, "CTK-003", {
      printedRulesText: "Play a Sprite unit token.",
      language: "FR",
    });

    await repo.recomputeForCard(plainId);
    expect(await tokensFor(plainId)).toEqual([]);
  });

  it("never derives the owning card as its own token", async () => {
    const repo = cardTokensRepo(ctx!.db);

    // The Buff token's own reminder line trips the implicit Buff rule, and
    // `chk_card_tokens_no_self` (migration 253) rejects the row that produced.
    await seedPrinting(buffId, "CTK-004", {
      printedRulesText: "A unit may have no more than one buff at a time.",
    });

    await repo.recomputeForCard(buffId);
    expect(await tokensFor(buffId)).toEqual([]);

    // The whole-catalog rebuild is one transaction, so a single self-row aborts
    // every card's derivation, not just the offending one.
    await repo.recomputeAll();
    expect(await tokensFor(buffId)).toEqual([]);
    expect(await tokensFor(summonerId)).toEqual([spriteId]);
  });
});
