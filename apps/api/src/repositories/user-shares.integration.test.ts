import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { friendGroupsRepo } from "./friend-groups.js";
import { listsRepo } from "./lists.js";
import { userSharesRepo } from "./user-shares.js";

const ctx = createDbContext("a0000000-0136-4000-a000-000000000001");

describe.skipIf(!ctx)("userSharesRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = userSharesRepo(db);
  const lists = listsRepo(db);
  const groups = friendGroupsRepo(db);
  const createdListIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdViewerIds: string[] = [];

  beforeAll(async () => {
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
    if (createdGroupIds.length > 0) {
      await db.deleteFrom("friendGroups").where("id", "in", createdGroupIds).execute();
    }
    if (createdViewerIds.length > 0) {
      await db.deleteFrom("users").where("id", "in", createdViewerIds).execute();
    }
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

  it("listsForOwner: anonymous viewer sees only lists with their own share_token", async () => {
    const publicWish = await lists.create({
      userId,
      name: "Bundle Test Public Wish",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(publicWish.id);
    await lists.setShareToken(publicWish.id, userId, "wish-tok", true);

    const privateWish = await lists.create({
      userId,
      name: "Bundle Test Private Wish",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(privateWish.id);

    const publicTrade = await lists.create({
      userId,
      name: "Bundle Test Public Trade",
      intent: "trade",
      kind: "copy",
    });
    createdListIds.push(publicTrade.id);
    await lists.setShareToken(publicTrade.id, userId, "trade-tok", true);

    const organize = await lists.create({
      userId,
      name: "Bundle Test Organize",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(organize.id);
    await lists.setShareToken(organize.id, userId, "organize-tok", true);

    const rows = await repo.listsForOwner(userId, null);
    const ids = rows.map((row) => row.list.id);
    expect(ids).toContain(publicWish.id);
    expect(ids).toContain(publicTrade.id);
    expect(ids).not.toContain(privateWish.id);
    expect(ids).not.toContain(organize.id);
  });

  it("listsForOwner: viewer in the same friend group sees group-shared lists", async () => {
    const viewerId = "a0000000-0136-4000-a000-000000000002";
    await db
      .insertInto("users")
      .values({
        id: viewerId,
        email: `viewer-${viewerId.slice(11, 15)}@test.com`,
        name: "Bundle Viewer",
        emailVerified: true,
        image: null,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
    createdViewerIds.push(viewerId);

    const group = await groups.createWithOwner(
      {
        slug: `bundle-test-${Date.now()}`,
        name: "Bundle Test Group",
        description: null,
        code: `BTG${Date.now()}`,
      },
      userId,
    );
    createdGroupIds.push(group.id);
    await groups.addMember(group.id, viewerId, "member");

    const groupOnly = await lists.create({
      userId,
      name: "Bundle Test Group-only Wish",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(groupOnly.id);
    await groups.share(group.id, groupOnly.id, userId);

    const memberRows = await repo.listsForOwner(userId, viewerId);
    expect(memberRows.map((row) => row.list.id)).toContain(groupOnly.id);

    const outsiderId = "a0000000-0136-4000-a000-000000000003";
    await db
      .insertInto("users")
      .values({
        id: outsiderId,
        email: `outsider-${outsiderId.slice(11, 15)}@test.com`,
        name: "Bundle Outsider",
        emailVerified: true,
        image: null,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
    createdViewerIds.push(outsiderId);

    const outsiderRows = await repo.listsForOwner(userId, outsiderId);
    expect(outsiderRows.map((row) => row.list.id)).not.toContain(groupOnly.id);

    const anonymousRows = await repo.listsForOwner(userId, null);
    expect(anonymousRows.map((row) => row.list.id)).not.toContain(groupOnly.id);
  });

  it("findListInBundle: rejects organize, gates by share_token + group membership", async () => {
    await repo.setShareToken(userId, "find-list-token");

    const publicWish = await lists.create({
      userId,
      name: "Find Bundle Public Wish",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(publicWish.id);
    await lists.setShareToken(publicWish.id, userId, "find-public-tok", true);

    const privateWish = await lists.create({
      userId,
      name: "Find Bundle Private Wish",
      intent: "wish",
      kind: "card",
    });
    createdListIds.push(privateWish.id);

    const organize = await lists.create({
      userId,
      name: "Find Bundle Organize",
      intent: "organize",
      kind: "card",
    });
    createdListIds.push(organize.id);

    const publicFound = await repo.findListInBundle("find-list-token", publicWish.id, null);
    expect(publicFound?.id).toBe(publicWish.id);

    const privateFound = await repo.findListInBundle("find-list-token", privateWish.id, null);
    expect(privateFound).toBeUndefined();

    const organizeFound = await repo.findListInBundle("find-list-token", organize.id, null);
    expect(organizeFound).toBeUndefined();

    const wrongTokenFound = await repo.findListInBundle("wrong-token", publicWish.id, null);
    expect(wrongTokenFound).toBeUndefined();
  });
});
