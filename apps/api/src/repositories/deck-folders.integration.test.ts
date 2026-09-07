import { afterAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { deckFoldersRepo } from "./deck-folders.js";

const ctx = createDbContext(crypto.randomUUID());

let userId: string;
let otherUserId: string;
let deckA: string;
let deckB: string;

async function seedDeck(owner: string, name: string): Promise<string> {
  const [deck] = await ctx!.db
    .insertInto("decks")
    .values({
      userId: owner,
      name,
      description: null,
      format: "freeform",
      formatConfig: null,
      isPublic: false,
    })
    .returning("id")
    .execute();
  return deck!.id;
}

if (ctx) {
  const { db } = ctx;

  const user = await seedTestUser(db);
  const other = await seedTestUser(db);
  userId = user.id;
  otherUserId = other.id;
  deckA = await seedDeck(userId, "DF Deck A");
  deckB = await seedDeck(userId, "DF Deck B");

  afterAll(async () => {
    // deck_folders and decks both cascade from users, which takes the
    // membership rows with them.
    await db.deleteFrom("users").where("id", "in", [userId, otherUserId]).execute();
  });
}

describe.skipIf(!ctx)("deckFoldersRepo", () => {
  const db = ctx!.db;
  const repo = deckFoldersRepo(db);

  it("creates folders at the end of the user's order", async () => {
    const first = await repo.create(userId, "DF Standard");
    const second = await repo.create(userId, "DF Jank");
    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);
    expect(first.deckCount).toBe(0);
  });

  it("rejects a duplicate name for the same user, case-insensitively", async () => {
    await repo.create(userId, "DF Unique");
    await expect(repo.create(userId, "df unique")).rejects.toThrow();
  });

  it("lets a different user reuse a name", async () => {
    await repo.create(userId, "DF Shared Name");
    const mine = await repo.create(otherUserId, "DF Shared Name");
    expect(mine.name).toBe("DF Shared Name");
  });

  it("files a deck into several folders at once", async () => {
    const one = await repo.create(userId, "DF Multi One");
    const two = await repo.create(userId, "DF Multi Two");
    await repo.setForDeck(deckA, userId, [one.id, two.id]);

    const byDeck = await repo.folderIdsByDeckIds([deckA], userId);
    expect(byDeck.get(deckA)?.toSorted()).toEqual([one.id, two.id].toSorted());
  });

  it("replaces membership wholesale rather than adding to it", async () => {
    const one = await repo.create(userId, "DF Replace One");
    const two = await repo.create(userId, "DF Replace Two");
    await repo.setForDeck(deckB, userId, [one.id, two.id]);
    await repo.setForDeck(deckB, userId, [two.id]);

    const byDeck = await repo.folderIdsByDeckIds([deckB], userId);
    expect(byDeck.get(deckB)).toEqual([two.id]);
  });

  it("clears membership on an empty id list", async () => {
    const folder = await repo.create(userId, "DF Clearable");
    await repo.setForDeck(deckB, userId, [folder.id]);
    await repo.setForDeck(deckB, userId, []);

    const byDeck = await repo.folderIdsByDeckIds([deckB], userId);
    expect(byDeck.has(deckB)).toBe(false);
  });

  it("silently ignores a folder belonging to another user", async () => {
    const mine = await repo.create(userId, "DF Mine");
    const theirs = await repo.create(otherUserId, "DF Theirs");
    await repo.setForDeck(deckA, userId, [mine.id, theirs.id]);

    const byDeck = await repo.folderIdsByDeckIds([deckA], userId);
    expect(byDeck.get(deckA)).toEqual([mine.id]);
  });

  it("counts the decks filed in each folder", async () => {
    const folder = await repo.create(userId, "DF Counted");
    await repo.setForDeck(deckA, userId, [folder.id]);
    await repo.setForDeck(deckB, userId, [folder.id]);

    const folders = await repo.listForUser(userId);
    expect(folders.find((entry) => entry.id === folder.id)?.deckCount).toBe(2);
  });

  it("renumbers sort_order to match the given order", async () => {
    const a = await repo.create(userId, "DF Order A");
    const b = await repo.create(userId, "DF Order B");
    const c = await repo.create(userId, "DF Order C");
    await repo.reorder(userId, [c.id, a.id, b.id]);

    const folders = await repo.listForUser(userId);
    const ordered = folders
      .filter((entry) => [a.id, b.id, c.id].includes(entry.id))
      .map((entry) => entry.id);
    expect(ordered).toEqual([c.id, a.id, b.id]);
  });

  it("ignores folders the user does not own when reordering", async () => {
    const theirs = await repo.create(otherUserId, "DF Not Yours");
    const before = await repo.listForUser(otherUserId);
    await repo.reorder(userId, [theirs.id]);
    const after = await repo.listForUser(otherUserId);
    expect(after.find((entry) => entry.id === theirs.id)?.sortOrder).toBe(
      before.find((entry) => entry.id === theirs.id)?.sortOrder,
    );
  });

  it("deletes a folder without deleting the decks in it", async () => {
    const folder = await repo.create(userId, "DF Doomed");
    await repo.setForDeck(deckA, userId, [folder.id]);
    const deleted = await repo.remove(folder.id, userId);
    expect(deleted).toBe(true);

    const deck = await db
      .selectFrom("decks")
      .select("id")
      .where("id", "=", deckA)
      .executeTakeFirst();
    expect(deck).toBeDefined();
    const byDeck = await repo.folderIdsByDeckIds([deckA], userId);
    expect(byDeck.get(deckA) ?? []).not.toContain(folder.id);
  });

  it("will not delete another user's folder", async () => {
    const theirs = await repo.create(otherUserId, "DF Protected");
    expect(await repo.remove(theirs.id, userId)).toBe(false);
  });

  it("renames a folder and refuses an unowned one", async () => {
    const mine = await repo.create(userId, "DF Rename Me");
    const renamed = await repo.rename(mine.id, userId, "DF Renamed");
    expect(renamed?.name).toBe("DF Renamed");
    expect(await repo.rename(mine.id, otherUserId, "DF Hijacked")).toBeUndefined();
  });

  it("returns an empty map for no deck ids", async () => {
    const byDeck = await repo.folderIdsByDeckIds([], userId);
    expect(byDeck.size).toBe(0);
  });
});
