import { afterAll, describe, expect, it } from "vitest";

import { CARD_BODY_UNIT, CARD_CALM_UNIT, CARD_FURY_UNIT } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { deckPlansRepo } from "./deck-plans.js";
import { decksRepo } from "./decks.js";

const ctx = createDbContext("a0000000-0058-4000-a000-000000000001");

describe.skipIf(!ctx)("deckPlansRepo (integration)", () => {
  const { db, userId } = ctx!;
  const plans = deckPlansRepo(db);
  const decks = decksRepo(db);

  const createdDeckIds: string[] = [];

  afterAll(async () => {
    for (const deckId of createdDeckIds.toReversed()) {
      // deck_plans / deck_matchup_plans cascade off the deck.
      await db.deleteFrom("decks").where("id", "=", deckId).execute();
    }
  });

  async function makeDeck(name: string): Promise<string> {
    const deck = await decks.create({
      userId,
      name,
      description: null,
      format: "constructed",
      isWanted: false,
      isPublic: false,
    });
    createdDeckIds.push(deck.id);
    return deck.id;
  }

  it("returns an empty plan for a deck with none", async () => {
    const deckId = await makeDeck("Plan Empty");
    const data = await plans.getForDeck(deckId);
    expect(data.plan).toBeUndefined();
    expect(data.matchups).toEqual([]);
  });

  it("round-trips deck-level fields, matchups, and swaps", async () => {
    const deckId = await makeDeck("Plan Round Trip");
    await plans.replaceForDeck(deckId, {
      generalStrategy: "Race them",
      mulliganSplit: true,
      mulliganGeneral: "",
      mulliganFirst: "Keep removal",
      mulliganSecond: "Keep threats",
      battlefieldG1CardId: CARD_BODY_UNIT.id,
      battlefieldFirstCardId: null,
      battlefieldSecondCardId: null,
      battlefieldCustom: false,
      battlefieldNote: "",
      matchups: [
        {
          opponentLegendCardId: CARD_CALM_UNIT.id,
          subtitle: "Wuju Bladesman",
          notes: "Watch the bench",
          swaps: [
            { cardId: CARD_FURY_UNIT.id, direction: "out", quantity: 2 },
            { cardId: CARD_BODY_UNIT.id, direction: "in", quantity: 2 },
          ],
        },
      ],
    });

    const data = await plans.getForDeck(deckId);
    expect(data.plan?.generalStrategy).toBe("Race them");
    expect(data.plan?.mulliganSplit).toBe(true);
    expect(data.plan?.battlefieldG1CardId).toBe(CARD_BODY_UNIT.id);
    expect(data.matchups).toHaveLength(1);
    expect(data.matchups[0]?.subtitle).toBe("Wuju Bladesman");
    expect(data.matchups[0]?.swaps).toHaveLength(2);
    const outSwap = data.matchups[0]?.swaps.find((swap) => swap.direction === "out");
    expect(outSwap?.cardId).toBe(CARD_FURY_UNIT.id);
    expect(outSwap?.quantity).toBe(2);
  });

  it("replaces the whole plan, ordering matchups by sort order", async () => {
    const deckId = await makeDeck("Plan Replace");
    await plans.replaceForDeck(deckId, {
      generalStrategy: "v1",
      mulliganSplit: false,
      mulliganGeneral: "",
      mulliganFirst: "",
      mulliganSecond: "",
      battlefieldG1CardId: null,
      battlefieldFirstCardId: null,
      battlefieldSecondCardId: null,
      battlefieldCustom: false,
      battlefieldNote: "",
      matchups: [
        { opponentLegendCardId: CARD_CALM_UNIT.id, subtitle: "a", notes: "", swaps: [] },
        { opponentLegendCardId: CARD_CALM_UNIT.id, subtitle: "b", notes: "", swaps: [] },
      ],
    });

    await plans.replaceForDeck(deckId, {
      generalStrategy: "v2",
      mulliganSplit: false,
      mulliganGeneral: "",
      mulliganFirst: "",
      mulliganSecond: "",
      battlefieldG1CardId: null,
      battlefieldFirstCardId: null,
      battlefieldSecondCardId: null,
      battlefieldCustom: false,
      battlefieldNote: "",
      matchups: [
        { opponentLegendCardId: CARD_FURY_UNIT.id, subtitle: "first", notes: "", swaps: [] },
        { opponentLegendCardId: CARD_CALM_UNIT.id, subtitle: "second", notes: "", swaps: [] },
      ],
    });

    const data = await plans.getForDeck(deckId);
    expect(data.plan?.generalStrategy).toBe("v2");
    expect(data.matchups.map((matchup) => matchup.subtitle)).toEqual(["first", "second"]);
  });

  it("preserves the plan row's id and created_at across an edit (upsert, not delete+insert)", async () => {
    const deckId = await makeDeck("Plan Upsert");
    const base = {
      mulliganSplit: false,
      mulliganGeneral: "",
      mulliganFirst: "",
      mulliganSecond: "",
      battlefieldG1CardId: null,
      battlefieldFirstCardId: null,
      battlefieldSecondCardId: null,
      battlefieldCustom: false,
      battlefieldNote: "",
      matchups: [],
    };
    await plans.replaceForDeck(deckId, { ...base, generalStrategy: "v1" });
    const first = await db
      .selectFrom("deckPlans")
      .select(["id", "createdAt", "updatedAt"])
      .where("deckId", "=", deckId)
      .executeTakeFirstOrThrow();

    await plans.replaceForDeck(deckId, { ...base, generalStrategy: "v2" });
    const second = await db
      .selectFrom("deckPlans")
      .select(["id", "createdAt", "updatedAt"])
      .where("deckId", "=", deckId)
      .executeTakeFirstOrThrow();

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toEqual(first.createdAt);
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
  });

  it("rejects duplicate matchups (same legend + subtitle) via the unique constraint", async () => {
    const deckId = await makeDeck("Plan Duplicate");
    await expect(
      plans.replaceForDeck(deckId, {
        generalStrategy: "",
        mulliganSplit: false,
        mulliganGeneral: "",
        mulliganFirst: "",
        mulliganSecond: "",
        battlefieldG1CardId: null,
        battlefieldFirstCardId: null,
        battlefieldSecondCardId: null,
        battlefieldCustom: false,
        battlefieldNote: "",
        matchups: [
          { opponentLegendCardId: CARD_CALM_UNIT.id, subtitle: "dup", notes: "", swaps: [] },
          { opponentLegendCardId: CARD_CALM_UNIT.id, subtitle: "dup", notes: "", swaps: [] },
        ],
      }),
    ).rejects.toThrow();
  });

  it("cascades plan rows when the deck is deleted", async () => {
    const deck = await decks.create({
      userId,
      name: "Plan Cascade",
      description: null,
      format: "constructed",
      isWanted: false,
      isPublic: false,
    });
    await plans.replaceForDeck(deck.id, {
      generalStrategy: "gone soon",
      mulliganSplit: false,
      mulliganGeneral: "",
      mulliganFirst: "",
      mulliganSecond: "",
      battlefieldG1CardId: null,
      battlefieldFirstCardId: null,
      battlefieldSecondCardId: null,
      battlefieldCustom: false,
      battlefieldNote: "",
      matchups: [{ opponentLegendCardId: CARD_CALM_UNIT.id, subtitle: "", notes: "", swaps: [] }],
    });
    await decks.deleteByIdForUser(deck.id, userId);

    const orphanPlan = await db
      .selectFrom("deckPlans")
      .selectAll()
      .where("deckId", "=", deck.id)
      .executeTakeFirst();
    expect(orphanPlan).toBeUndefined();
    const orphanMatchups = await db
      .selectFrom("deckMatchupPlans")
      .selectAll()
      .where("deckId", "=", deck.id)
      .execute();
    expect(orphanMatchups).toEqual([]);
  });
});
