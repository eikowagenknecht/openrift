import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PRINTING_1 } from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { collectionDeckbuildingPrefsRepo } from "./collection-deckbuilding-prefs.js";
import { collectionsRepo } from "./collections.js";
import { copiesRepo } from "./copies.js";

const USER_ID = crypto.randomUUID();

const ctx = createDbContext(USER_ID);

// A deck's home collection overrides the deck-building exclusion for that deck
// only: the box the deck lives in is buildable for it, and stays locked away
// for every other deck.
describe.skipIf(!ctx)("copiesRepo home-collection exemption (integration)", () => {
  const { db } = ctx!;
  const copies = copiesRepo(db);
  const collections = collectionsRepo(db);
  const deckbuildingPrefs = collectionDeckbuildingPrefsRepo(db);

  const cardId = PRINTING_1.cardId;
  const collectionIds: string[] = [];
  let openId: string;
  let excludedId: string;
  let otherExcludedId: string;

  beforeAll(async () => {
    await seedTestUser(db, { id: USER_ID });

    const makeCollection = async (name: string) => {
      const row = await collections.create({
        userId: USER_ID,
        groupId: null,
        name,
        description: null,
        isInbox: false,
        sortOrder: collectionIds.length,
      });
      collectionIds.push(row.id);
      return row.id;
    };

    openId = await makeCollection("Open shelf");
    excludedId = await makeCollection("Red deckbox");
    otherExcludedId = await makeCollection("Blue deckbox");
    await deckbuildingPrefs.set(USER_ID, excludedId, false);
    await deckbuildingPrefs.set(USER_ID, otherExcludedId, false);

    // 1 buildable copy on the open shelf, 3 sleeved in the red deckbox, 2 in
    // the blue one (another deck's box).
    await copies.insertBatch([{ printingId: PRINTING_1.id, collectionId: openId }]);
    await copies.insertBatch([
      { printingId: PRINTING_1.id, collectionId: excludedId },
      { printingId: PRINTING_1.id, collectionId: excludedId },
      { printingId: PRINTING_1.id, collectionId: excludedId },
    ]);
    await copies.insertBatch([
      { printingId: PRINTING_1.id, collectionId: otherExcludedId },
      { printingId: PRINTING_1.id, collectionId: otherExcludedId },
    ]);
  });

  afterAll(async () => {
    await db.deleteFrom("copies").where("collectionId", "in", collectionIds).execute();
    await db
      .deleteFrom("collectionDeckbuildingPrefs")
      .where("collectionId", "in", collectionIds)
      .execute();
    await db.deleteFrom("collections").where("id", "in", collectionIds).execute();
    await db.deleteFrom("users").where("id", "=", USER_ID).execute();
  });

  it("counts only the open shelf without an exemption", async () => {
    const counts = await copies.buildableCountByCard(USER_ID);
    expect(counts.get(cardId)).toBe(1);
  });

  it("adds the exempt collection's copies for the deck stored there", async () => {
    const counts = await copies.buildableCountByCard(USER_ID, excludedId);
    expect(counts.get(cardId)).toBe(4);
  });

  it("leaves the other deck's box locked away", async () => {
    // A deck stored in the blue box gets 1 open + 2 blue; the 3 in the red box
    // stay locked for it.
    const counts = await copies.buildableCountByCard(USER_ID, otherExcludedId);
    expect(counts.get(cardId)).toBe(3);
  });

  it("exempting an already-available collection changes nothing", async () => {
    const counts = await copies.buildableCountByCard(USER_ID, openId);
    expect(counts.get(cardId)).toBe(1);
  });

  it("applies the exemption to the per-printing counts too", async () => {
    const withoutExemption = await copies.countByCardAndPrintingForDeckbuilding(USER_ID);
    expect(withoutExemption.find((row) => row.printingId === PRINTING_1.id)?.count).toBe(1);

    const withExemption = await copies.countByCardAndPrintingForDeckbuilding(USER_ID, excludedId);
    expect(withExemption.find((row) => row.printingId === PRINTING_1.id)?.count).toBe(4);
  });

  it("reports per-collection extras for the excluded boxes only", async () => {
    const extras = await copies.buildableCountByCardForCollections(USER_ID, [
      openId,
      excludedId,
      otherExcludedId,
    ]);
    // The open shelf is already in `buildableCountByCard`, so it contributes
    // nothing extra and never shows up here.
    expect(extras.has(openId)).toBe(false);
    expect(extras.get(excludedId)?.get(cardId)).toBe(3);
    expect(extras.get(otherExcludedId)?.get(cardId)).toBe(2);
  });

  it("returns an empty map when no deck has a home collection", async () => {
    const extras = await copies.buildableCountByCardForCollections(USER_ID, []);
    expect(extras.size).toBe(0);
  });
});
