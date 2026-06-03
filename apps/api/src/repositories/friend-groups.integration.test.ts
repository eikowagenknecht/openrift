import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  CARD_FURY_UNIT,
  CARD_FURY_SPELL,
  PRINTING_1,
  PRINTING_2,
} from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { friendGroupMatchesRepo } from "./friend-group-matches.js";
import { friendGroupsRepo } from "./friend-groups.js";

const VIEWER_ID = "a0000000-0050-4000-a000-000000000001";
const ADMIN_ID = "a0000000-0051-4000-a000-000000000001";
const SELLER_ID = "a0000000-0052-4000-a000-000000000001";
const OUTSIDER_ID = "a0000000-0053-4000-a000-000000000001";

const ALT_PRINTING_OF_FURY_UNIT = "019d17a1-2723-733a-a21e-4630e4370046";

const ctx = createDbContext(VIEWER_ID);

describe.skipIf(!ctx)("friendGroupsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = friendGroupsRepo(db);
  const matches = friendGroupMatchesRepo(db);

  const createdGroupIds: string[] = [];
  const createdListIds: string[] = [];
  const createdCollectionIds: string[] = [];
  const createdCopyIds: string[] = [];
  const recreatedUserIds: string[] = [];

  afterAll(async () => {
    if (createdGroupIds.length > 0) {
      await db.deleteFrom("friendGroups").where("id", "in", createdGroupIds).execute();
    }
    if (createdListIds.length > 0) {
      await db.deleteFrom("lists").where("id", "in", createdListIds).execute();
    }
    if (createdCopyIds.length > 0) {
      await db.deleteFrom("copies").where("id", "in", createdCopyIds).execute();
    }
    if (createdCollectionIds.length > 0) {
      await db.deleteFrom("collections").where("id", "in", createdCollectionIds).execute();
    }
  });

  // Restore any users a test deleted (cascade scenarios) BEFORE the next test —
  // otherwise later tests that reference VIEWER_ID/OUTSIDER_ID hit the
  // friend_group_members_user_id FK. (Deleting in afterAll left them gone for
  // the rest of the suite.)
  afterEach(async () => {
    for (const userId of recreatedUserIds) {
      await db
        .insertInto("users")
        .values({
          id: userId,
          email: `repo-${userId.slice(11, 15)}@test.com`,
          name: "Test User",
          emailVerified: true,
          image: null,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }
    recreatedUserIds.length = 0;
  });

  beforeAll(async () => {
    // Ensure the four test users exist (the test harness pre-seeds them but
    // earlier tests may have deleted them as part of a cascade scenario).
    for (const id of [VIEWER_ID, ADMIN_ID, SELLER_ID, OUTSIDER_ID]) {
      await db
        .insertInto("users")
        .values({
          id,
          email: `repo-${id.slice(11, 15)}@test.com`,
          name: "Test User",
          emailVerified: true,
          image: null,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }
  });

  async function uniqueSlug(prefix: string): Promise<string> {
    return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  async function createGroup(ownerId: string, code: string | null = null) {
    const slug = await uniqueSlug("fg");
    const group = await repo.createWithOwner(
      { slug, name: "Test Group", description: null, code },
      ownerId,
    );
    createdGroupIds.push(group.id);
    return group;
  }

  async function ensureCollection(userId: string) {
    const existing = await db
      .selectFrom("collections")
      .selectAll()
      .where("userId", "=", userId)
      .executeTakeFirst();
    if (existing) {
      return existing;
    }
    const created = await db
      .insertInto("collections")
      .values({
        userId,
        name: "Friend-Groups Test Binder",
        isInbox: false,
        sortOrder: 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCollectionIds.push(created.id);
    return created;
  }

  async function addCopy(userId: string, printingId: string) {
    const collection = await ensureCollection(userId);
    const copy = await db
      .insertInto("copies")
      .values({ printingId, collectionId: collection.id })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCopyIds.push(copy.id);
    return copy;
  }

  async function createList(
    userId: string,
    intent: "wish" | "trade" | "organize",
    kind: "card" | "printing" | "copy",
  ) {
    const list = await db
      .insertInto("lists")
      .values({ userId, name: `Test ${intent}/${kind}`, intent, kind })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdListIds.push(list.id);
    return list;
  }

  // ── Schema invariants ─────────────────────────────────────────────────────

  it("creates a group with the creator as the sole owner", async () => {
    const group = await createGroup(VIEWER_ID);
    const members = await repo.listMembers(group.id);
    expect(members).toHaveLength(1);
    expect(members[0]?.userId).toBe(VIEWER_ID);
    expect(members[0]?.role).toBe("owner");
  });

  it("rejects a second owner via the partial unique index", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, ADMIN_ID, "admin");
    await expect(repo.updateRole(group.id, ADMIN_ID, "owner")).rejects.toThrow();
  });

  it("rejects a duplicate non-null code", async () => {
    await createGroup(VIEWER_ID, "DUPLCODE0001");
    await expect(createGroup(VIEWER_ID, "DUPLCODE0001")).rejects.toThrow();
  });

  it("allows multiple groups with NULL code (partial unique)", async () => {
    const a = await createGroup(VIEWER_ID, null);
    const b = await createGroup(VIEWER_ID, null);
    expect(a.id).not.toBe(b.id);
    expect(a.code).toBeNull();
    expect(b.code).toBeNull();
  });

  it("rotates the code and invalidates the prior value", async () => {
    const group = await createGroup(VIEWER_ID, "ORIGCODE0001");
    const updated = await repo.setCode(group.id, "NEWCODE00001");
    expect(updated?.code).toBe("NEWCODE00001");
    expect(await repo.getByCode("ORIGCODE0001")).toBeUndefined();
    const fetched = await repo.getByCode("NEWCODE00001");
    expect(fetched?.id).toBe(group.id);
  });

  it("setCode(null) disables code-based joining", async () => {
    const group = await createGroup(VIEWER_ID, "TOGGLEOFF001");
    await repo.setCode(group.id, null);
    expect(await repo.getByCode("TOGGLEOFF001")).toBeUndefined();
  });

  it("rejects an invalid slug at the CHECK constraint", async () => {
    await expect(
      repo.createWithOwner({ slug: "X", name: "Bad", description: null, code: null }, VIEWER_ID),
    ).rejects.toThrow();
  });

  it("rejects sharing into a group the user is not a member of", async () => {
    const group = await createGroup(VIEWER_ID);
    const list = await createList(OUTSIDER_ID, "wish", "card");
    // Outsider is not in the group, so the composite FK to friend_group_members
    // must reject this share.
    await expect(repo.share(group.id, list.id, OUTSIDER_ID)).rejects.toThrow();
  });

  it("transfers ownership atomically (outgoing demoted, target promoted)", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, ADMIN_ID, "admin");
    await repo.transferOwnership(group.id, VIEWER_ID, ADMIN_ID);
    const viewer = await repo.getMembership(group.id, VIEWER_ID);
    const target = await repo.getMembership(group.id, ADMIN_ID);
    expect(viewer?.role).toBe("admin");
    expect(target?.role).toBe("owner");
  });

  it("leave-cascade drops the user's shares for that group", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");
    const sellList = await createList(SELLER_ID, "trade", "copy");
    await repo.share(group.id, sellList.id, SELLER_ID);
    expect(await repo.listSharesForGroup(group.id)).toHaveLength(1);

    await repo.removeMember(group.id, SELLER_ID);
    expect(await repo.listSharesForGroup(group.id)).toHaveLength(0);
  });

  it("deleting the owner's user account auto-promotes the oldest admin", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, ADMIN_ID, "admin");
    await repo.addMember(group.id, SELLER_ID, "member");

    // Delete the owner. CASCADE drops their member row → trigger fires →
    // promotes the admin (oldest admin first).
    await db.deleteFrom("users").where("id", "=", VIEWER_ID).execute();
    recreatedUserIds.push(VIEWER_ID);

    const newOwner = await db
      .selectFrom("friendGroupMembers")
      .selectAll()
      .where("groupId", "=", group.id)
      .where("role", "=", "owner")
      .executeTakeFirst();
    expect(newOwner?.userId).toBe(ADMIN_ID);
  });

  it("deleting the lone owner deletes the group entirely", async () => {
    const group = await createGroup(OUTSIDER_ID);
    await db.deleteFrom("users").where("id", "=", OUTSIDER_ID).execute();
    recreatedUserIds.push(OUTSIDER_ID);
    expect(await repo.getById(group.id)).toBeUndefined();
  });

  // ── Match view ────────────────────────────────────────────────────────────

  it("kind='card' matches any printing of that card", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");

    const wish = await createList(VIEWER_ID, "wish", "card");
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: VIEWER_ID,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, wish.id, VIEWER_ID);

    // Seller offers an alt printing of the same card.
    const copy = await addCopy(SELLER_ID, ALT_PRINTING_OF_FURY_UNIT);
    const trade = await createList(SELLER_ID, "trade", "copy");
    await db
      .insertInto("listEntries")
      .values({
        listId: trade.id,
        userId: SELLER_ID,
        kind: "copy",
        copyId: copy.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, trade.id, SELLER_ID);

    const rows = await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cardId).toBe(CARD_FURY_UNIT.id);
    expect(rows[0]?.printingId).toBe(ALT_PRINTING_OF_FURY_UNIT);
  });

  it("kind='printing' matches only that exact printing", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");

    const wish = await createList(VIEWER_ID, "wish", "printing");
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: VIEWER_ID,
        kind: "printing",
        printingId: PRINTING_1.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, wish.id, VIEWER_ID);

    // Seller has the alt printing of the same card — must NOT match.
    const altCopy = await addCopy(SELLER_ID, ALT_PRINTING_OF_FURY_UNIT);
    const trade = await createList(SELLER_ID, "trade", "copy");
    await db
      .insertInto("listEntries")
      .values({
        listId: trade.id,
        userId: SELLER_ID,
        kind: "copy",
        copyId: altCopy.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, trade.id, SELLER_ID);

    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(0);

    // Add the exact printing — now it matches.
    const exactCopy = await addCopy(SELLER_ID, PRINTING_1.id);
    await db
      .insertInto("listEntries")
      .values({
        listId: trade.id,
        userId: SELLER_ID,
        kind: "copy",
        copyId: exactCopy.id,
        quantity: 1,
      })
      .execute();
    const rows = await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.printingId).toBe(PRINTING_1.id);
  });

  it("unshared lists never surface, even if shared with a different group", async () => {
    const groupA = await createGroup(VIEWER_ID);
    const groupB = await createGroup(VIEWER_ID);
    await repo.addMember(groupA.id, SELLER_ID, "member");
    await repo.addMember(groupB.id, SELLER_ID, "member");

    const wish = await createList(VIEWER_ID, "wish", "card");
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: VIEWER_ID,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        quantity: 1,
      })
      .execute();
    await repo.share(groupA.id, wish.id, VIEWER_ID);
    await repo.share(groupB.id, wish.id, VIEWER_ID);

    const copy = await addCopy(SELLER_ID, PRINTING_1.id);
    const trade = await createList(SELLER_ID, "trade", "copy");
    await db
      .insertInto("listEntries")
      .values({
        listId: trade.id,
        userId: SELLER_ID,
        kind: "copy",
        copyId: copy.id,
        quantity: 1,
      })
      .execute();
    // Sell list shared with B only.
    await repo.share(groupB.id, trade.id, SELLER_ID);

    expect(
      await matches.othersHaveYourWants({ groupId: groupA.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(0);
    expect(
      await matches.othersHaveYourWants({ groupId: groupB.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(1);
  });

  it("organize lists never appear in the match view", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");

    const wish = await createList(VIEWER_ID, "wish", "card");
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: VIEWER_ID,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, wish.id, VIEWER_ID);

    // Seller has the matching card in an ORGANIZE list (not trade).
    const copy = await addCopy(SELLER_ID, PRINTING_1.id);
    const organize = await createList(SELLER_ID, "organize", "copy");
    await db
      .insertInto("listEntries")
      .values({
        listId: organize.id,
        userId: SELLER_ID,
        kind: "copy",
        copyId: copy.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, organize.id, SELLER_ID);

    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(0);
  });

  it("the viewer's own lists never match themselves", async () => {
    const group = await createGroup(VIEWER_ID);

    const wish = await createList(VIEWER_ID, "wish", "card");
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: VIEWER_ID,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, wish.id, VIEWER_ID);

    const copy = await addCopy(VIEWER_ID, PRINTING_1.id);
    const trade = await createList(VIEWER_ID, "trade", "copy");
    await db
      .insertInto("listEntries")
      .values({
        listId: trade.id,
        userId: VIEWER_ID,
        kind: "copy",
        copyId: copy.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, trade.id, VIEWER_ID);

    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(0);
    expect(
      await matches.othersWantYourHaves({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(0);
  });

  it("deck-derived demand never appears (only explicit wish entries do)", async () => {
    // We never read decks in the match query, so there is nothing structural
    // to assert against. Instead we assert the *negative*: with no wishlist
    // entries, the match view stays empty even when the seller has a copy of
    // the card the viewer's deck would want.
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");

    // Viewer has no wishlist — only a deck might create implicit demand, but
    // decks are explicitly out of scope.
    const copy = await addCopy(SELLER_ID, PRINTING_1.id);
    const trade = await createList(SELLER_ID, "trade", "copy");
    await db
      .insertInto("listEntries")
      .values({
        listId: trade.id,
        userId: SELLER_ID,
        kind: "copy",
        copyId: copy.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, trade.id, SELLER_ID);

    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(0);
  });

  it("after kick, the kicked user's shares stop appearing for remaining members", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");

    const wish = await createList(VIEWER_ID, "wish", "card");
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: VIEWER_ID,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, wish.id, VIEWER_ID);

    const copy = await addCopy(SELLER_ID, PRINTING_1.id);
    const trade = await createList(SELLER_ID, "trade", "copy");
    await db
      .insertInto("listEntries")
      .values({
        listId: trade.id,
        userId: SELLER_ID,
        kind: "copy",
        copyId: copy.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, trade.id, SELLER_ID);

    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(1);

    await repo.removeMember(group.id, SELLER_ID);

    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(0);
  });

  it("othersWantYourHaves mirrors the query (viewer is seller side)", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");

    // Other member wants Fury Unit.
    const wish = await createList(SELLER_ID, "wish", "card");
    await db
      .insertInto("listEntries")
      .values({
        listId: wish.id,
        userId: SELLER_ID,
        kind: "card",
        cardId: CARD_FURY_UNIT.id,
        quantity: 2,
      })
      .execute();
    await repo.share(group.id, wish.id, SELLER_ID);

    // Viewer has the printing.
    const copy = await addCopy(VIEWER_ID, PRINTING_1.id);
    const trade = await createList(VIEWER_ID, "trade", "copy");
    await db
      .insertInto("listEntries")
      .values({
        listId: trade.id,
        userId: VIEWER_ID,
        kind: "copy",
        copyId: copy.id,
        quantity: 1,
      })
      .execute();
    await repo.share(group.id, trade.id, VIEWER_ID);

    const rows = await matches.othersWantYourHaves({ groupId: group.id, viewerUserId: VIEWER_ID });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.counterpartyUserId).toBe(SELLER_ID);
    expect(rows[0]?.cardId).toBe(CARD_FURY_UNIT.id);
    expect(rows[0]?.buyQuantity).toBe(2);

    // CARD_FURY_SPELL is not in anyone's lists — sanity check we only got one row.
    expect(rows.every((row) => row.cardId !== CARD_FURY_SPELL.id)).toBe(true);
    // PRINTING_2 wasn't involved — sanity check.
    expect(rows.every((row) => row.printingId !== PRINTING_2.id)).toBe(true);
  });

  // ── Collection shares ─────────────────────────────────────────────────────

  async function createPersonalCollection(userId: string, name = "Test Binder") {
    const created = await db
      .insertInto("collections")
      .values({
        userId,
        name,
        isInbox: false,
        sortOrder: 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCollectionIds.push(created.id);
    return created;
  }

  async function createPooledCollection(groupId: string, name = "Pooled Binder") {
    const created = await db
      .insertInto("collections")
      .values({
        groupId,
        name,
        isInbox: false,
        sortOrder: 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdCollectionIds.push(created.id);
    return created;
  }

  it("shareCollection inserts a row and is idempotent", async () => {
    const group = await createGroup(VIEWER_ID);
    const col = await createPersonalCollection(VIEWER_ID);
    await repo.shareCollection(group.id, col.id, VIEWER_ID);
    await repo.shareCollection(group.id, col.id, VIEWER_ID);
    expect(await repo.collectionSharesForGroup(group.id)).toHaveLength(1);
  });

  it("unshareCollection removes the row", async () => {
    const group = await createGroup(VIEWER_ID);
    const col = await createPersonalCollection(VIEWER_ID);
    await repo.shareCollection(group.id, col.id, VIEWER_ID);
    await repo.unshareCollection(group.id, col.id);
    expect(await repo.collectionSharesForGroup(group.id)).toHaveLength(0);
  });

  it("rejects sharing into a group the user is not a member of", async () => {
    const group = await createGroup(VIEWER_ID);
    const col = await createPersonalCollection(OUTSIDER_ID);
    await expect(repo.shareCollection(group.id, col.id, OUTSIDER_ID)).rejects.toThrow();
  });

  it("rejects sharing a pooled (group-owned) collection", async () => {
    const group = await createGroup(VIEWER_ID);
    const pooled = await createPooledCollection(group.id);
    // The share row's user_id is NOT NULL, but the pooled collection has
    // user_id IS NULL — composite FK to collections(id, user_id) blocks it.
    await expect(repo.shareCollection(group.id, pooled.id, VIEWER_ID)).rejects.toThrow();
  });

  it("rejects sharing another user's collection (FK enforces ownership match)", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");
    const col = await createPersonalCollection(SELLER_ID);
    // VIEWER tries to claim ownership of SELLER's collection via the share.
    await expect(repo.shareCollection(group.id, col.id, VIEWER_ID)).rejects.toThrow();
  });

  it("leave-cascade drops the user's collection-shares for that group", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");
    const col = await createPersonalCollection(SELLER_ID);
    await repo.shareCollection(group.id, col.id, SELLER_ID);
    expect(await repo.collectionSharesForGroup(group.id)).toHaveLength(1);

    await repo.removeMember(group.id, SELLER_ID);
    expect(await repo.collectionSharesForGroup(group.id)).toHaveLength(0);
  });

  it("collectionShareableForUserInGroup returns the user's collections with shared flag", async () => {
    const group = await createGroup(VIEWER_ID);
    const colA = await createPersonalCollection(VIEWER_ID, "Binder A");
    const colB = await createPersonalCollection(VIEWER_ID, "Binder B");
    await repo.shareCollection(group.id, colA.id, VIEWER_ID);

    const rows = await repo.collectionShareableForUserInGroup(group.id, VIEWER_ID);
    const byId = new Map(rows.map((row) => [row.collectionId, row]));
    expect(byId.get(colA.id)?.sharedAt).toBeInstanceOf(Date);
    expect(byId.get(colB.id)?.sharedAt).toBeNull();
  });

  it("groupsSharingCollection returns each group the collection is in", async () => {
    const groupA = await createGroup(VIEWER_ID);
    const groupB = await createGroup(VIEWER_ID);
    const col = await createPersonalCollection(VIEWER_ID);
    await repo.shareCollection(groupA.id, col.id, VIEWER_ID);
    await repo.shareCollection(groupB.id, col.id, VIEWER_ID);

    const groups = await repo.groupsSharingCollection(col.id);
    const ids = new Set(groups.map((g) => g.groupId));
    expect(ids.has(groupA.id)).toBe(true);
    expect(ids.has(groupB.id)).toBe(true);
  });

  it("viewerCanReadCollection: true via shared group, false without membership", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");
    const col = await createPersonalCollection(VIEWER_ID);
    await repo.shareCollection(group.id, col.id, VIEWER_ID);

    expect(await repo.viewerCanReadCollection(SELLER_ID, col.id)).toBe(true);
    expect(await repo.viewerCanReadCollection(OUTSIDER_ID, col.id)).toBe(false);
  });

  it("getSharedCollection returns owner info when viewer is a member, undefined otherwise", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");
    const col = await createPersonalCollection(VIEWER_ID, "Viewer's binder");
    await repo.shareCollection(group.id, col.id, VIEWER_ID);

    const seenByMember = await repo.getSharedCollection(group.id, col.id, SELLER_ID);
    expect(seenByMember?.collection.id).toBe(col.id);
    expect(seenByMember?.collection.name).toBe("Viewer's binder");

    const seenByOutsider = await repo.getSharedCollection(group.id, col.id, OUTSIDER_ID);
    expect(seenByOutsider).toBeUndefined();
  });

  it("collectionsBundleForViewer groups multiple via-groups under one collection", async () => {
    const groupA = await createGroup(VIEWER_ID);
    const groupB = await createGroup(VIEWER_ID);
    await repo.addMember(groupA.id, SELLER_ID, "member");
    await repo.addMember(groupB.id, SELLER_ID, "member");
    const col = await createPersonalCollection(VIEWER_ID, "Bundle binder");
    await repo.shareCollection(groupA.id, col.id, VIEWER_ID);
    await repo.shareCollection(groupB.id, col.id, VIEWER_ID);

    const bundle = await repo.collectionsBundleForViewer(VIEWER_ID, SELLER_ID);
    const entry = bundle.find((b) => b.collectionId === col.id);
    expect(entry).toBeDefined();
    expect(entry?.viaGroups.map((g) => g.id).sort()).toEqual([groupA.id, groupB.id].sort());
  });
});
