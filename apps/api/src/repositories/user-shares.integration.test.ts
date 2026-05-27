import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { listsRepo } from "./lists.js";
import { userSharesRepo } from "./user-shares.js";

const ctx = createDbContext("a0000000-0136-4000-a000-000000000001");

describe.skipIf(!ctx)("userSharesRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = userSharesRepo(db);
  const lists = listsRepo(db);
  const createdListIds: string[] = [];

  beforeAll(async () => {
    // Ensure the test user row exists (the shared dev DB is reused, but a
    // crashed prior run may have removed it).
    await db
      .insertInto("users")
      .values({
        id: userId,
        email: `repo-${userId.slice(11, 15)}@test.com`,
        name: "Bundle Tester",
        emailVerified: true,
        image: null,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  });

  afterAll(async () => {
    if (createdListIds.length > 0) {
      await db.deleteFrom("lists").where("id", "in", createdListIds).execute();
    }
    // Reset share state so the test does not leak into other suites.
    await db.updateTable("users").set({ shareToken: null }).where("id", "=", userId).execute();
  });

  it("enables, reads back, and revokes the share token", async () => {
    const enabled = await repo.setShareToken(userId, "test-token-enable");
    expect(enabled?.shareToken).toBe("test-token-enable");

    const read = await repo.getShareToken(userId);
    expect(read?.shareToken).toBe("test-token-enable");

    const revoked = await repo.setShareToken(userId, null);
    expect(revoked?.shareToken).toBeNull();

    const afterRevoke = await repo.getShareToken(userId);
    expect(afterRevoke?.shareToken).toBeNull();
  });

  it("rotates by overwriting the existing token", async () => {
    await repo.setShareToken(userId, "rotate-first");
    await repo.setShareToken(userId, "rotate-second");

    const read = await repo.getShareToken(userId);
    expect(read?.shareToken).toBe("rotate-second");

    const ownerFromFirst = await repo.findOwnerByShareToken("rotate-first");
    expect(ownerFromFirst).toBeUndefined();

    const ownerFromSecond = await repo.findOwnerByShareToken("rotate-second");
    expect(ownerFromSecond?.userId).toBe(userId);
  });

  it("findOwnerByShareToken returns undefined for an unknown token", async () => {
    const result = await repo.findOwnerByShareToken("does-not-exist");
    expect(result).toBeUndefined();
  });

  it("listsForOwner returns only wish and trade lists, excluding organize", async () => {
    const wish = await lists.create({
      userId,
      name: "Bundle Test Wish",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(wish.id);
    const trade = await lists.create({
      userId,
      name: "Bundle Test Trade",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(trade.id);
    const organize = await lists.create({
      userId,
      name: "Bundle Test Organize",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(organize.id);

    const rows = await repo.listsForOwner(userId);
    const ids = rows.map((r) => r.list.id);
    expect(ids).toContain(wish.id);
    expect(ids).toContain(trade.id);
    expect(ids).not.toContain(organize.id);
  });

  it("findListInBundle resolves wish + trade lists, rejects organize", async () => {
    await repo.setShareToken(userId, "find-list-token");

    const wish = await lists.create({
      userId,
      name: "Find Bundle Wish",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(wish.id);
    const organize = await lists.create({
      userId,
      name: "Find Bundle Organize",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(organize.id);

    const wishFound = await repo.findListInBundle("find-list-token", wish.id);
    expect(wishFound?.id).toBe(wish.id);

    const organizeFound = await repo.findListInBundle("find-list-token", organize.id);
    expect(organizeFound).toBeUndefined();

    const wrongTokenFound = await repo.findListInBundle("wrong-token", wish.id);
    expect(wrongTokenFound).toBeUndefined();
  });
});
