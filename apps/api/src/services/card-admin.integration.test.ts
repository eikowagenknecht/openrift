import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTransact } from "../deps.js";
import type { Io } from "../io.js";
import { candidateMutationsRepo } from "../repositories/candidate-mutations.js";
import { createDbContext, syncCardCardTypes } from "../test/integration-context.js";
import { deleteCard } from "./card-admin.js";

// ---------------------------------------------------------------------------
// deleteCard against a real database: the blocker check must refuse while a
// user's copy references one of the card's printings, and after the copy is
// gone the delete must remove the card, its printings, and cascading children
// (aliases) in one transaction.
// ---------------------------------------------------------------------------

// Self-inserted (not in the pre-seeded registry) so this file owns its user.
// 0201 is marked RESERVED in integration-setup TEST_USERS — 0199 is taken by
// the pre-seeded card-review-grant user, which a self-insert would collide
// with (and the teardown delete would break that file mid-run).
const USER_ID = "a0000000-0201-4000-a000-000000000001";
const ctx = createDbContext(USER_ID);

describe.skipIf(!ctx)("deleteCard (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const transact = createTransact(db);
  const mut = candidateMutationsRepo(db);

  const SET_SLUG = "CADM-TEST";
  const CARD_SLUG = "CADM-001";

  let setId = "";
  let cardId = "";
  let printingId = "";
  let collectionId = "";
  let copyId = "";

  beforeAll(async () => {
    await db
      .insertInto("users")
      .values({
        id: USER_ID,
        email: "card-admin-0201@test.com",
        name: "Test User",
        emailVerified: true,
        image: null,
      })
      .execute();

    const [setRow] = await db
      .insertInto("sets")
      .values({ slug: SET_SLUG, name: "Card Admin Test Set", printedTotal: 1, sortOrder: 952 })
      .returning("id")
      .execute();
    setId = setRow.id;

    const [cardRow] = await db
      .insertInto("cards")
      .values({
        slug: CARD_SLUG,
        name: "Card Admin Test Card",
        type: "unit",
        might: null,
        energy: 1,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .execute();
    cardId = cardRow.id;
    await syncCardCardTypes(db);
    await db.insertInto("cardDomains").values({ cardId, domainSlug: "fury", ordinal: 0 }).execute();
    await db
      .insertInto("cardNameAliases")
      .values({ cardId, normName: "card admin alias" })
      .execute();

    const [printingRow] = await db
      .insertInto("printings")
      .values({
        cardId,
        setId,
        shortCode: "CADM-001",
        rarity: "common",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Test",
        publicCode: "CADM-001",
        language: "EN",
      })
      .returning("id")
      .execute();
    printingId = printingRow.id;

    const [collectionRow] = await db
      .insertInto("collections")
      .values({ userId: USER_ID, name: "Card Admin Test Collection" })
      .returning("id")
      .execute();
    collectionId = collectionRow.id;

    const [copyRow] = await db
      .insertInto("copies")
      .values({ collectionId, printingId })
      .returning("id")
      .execute();
    copyId = copyRow.id;
  });

  afterAll(async () => {
    // Defensive cleanup for the failure case; the happy path already deleted
    // the copy, card, and printings.
    await db.deleteFrom("copies").where("id", "=", copyId).execute();
    await db.deleteFrom("collections").where("id", "=", collectionId).execute();
    await db.deleteFrom("printings").where("cardId", "=", cardId).execute();
    await db.deleteFrom("cards").where("id", "=", cardId).execute();
    await db.deleteFrom("sets").where("id", "=", setId).execute();
    await db.deleteFrom("users").where("id", "=", USER_ID).execute();
  });

  it("refuses with CONFLICT while a copy references one of the card's printings", async () => {
    await expect(
      deleteCard(transact, {} as Io, { candidateMutations: mut }, cardId),
    ).rejects.toThrow("collection copies (1)");

    const stillThere = await db
      .selectFrom("cards")
      .select("id")
      .where("id", "=", cardId)
      .executeTakeFirst();
    expect(stillThere).toBeDefined();
  });

  it("deletes the card, its printings, and cascading children once unblocked", async () => {
    await db.deleteFrom("copies").where("id", "=", copyId).execute();

    await deleteCard(transact, {} as Io, { candidateMutations: mut }, cardId);

    const card = await db
      .selectFrom("cards")
      .select("id")
      .where("id", "=", cardId)
      .executeTakeFirst();
    expect(card).toBeUndefined();

    const printings = await db
      .selectFrom("printings")
      .select("id")
      .where("cardId", "=", cardId)
      .execute();
    expect(printings).toEqual([]);

    const aliases = await db
      .selectFrom("cardNameAliases")
      .select("normName")
      .where("cardId", "=", cardId)
      .execute();
    expect(aliases).toEqual([]);
  });

  it("throws NOT_FOUND for a card that does not exist", async () => {
    await expect(
      deleteCard(
        transact,
        {} as Io,
        { candidateMutations: mut },
        "00000000-0000-4000-a000-000000000000",
      ),
    ).rejects.toThrow("Card not found");
  });
});
