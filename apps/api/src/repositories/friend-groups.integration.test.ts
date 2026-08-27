import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  CARD_FURY_UNIT,
  CARD_FURY_SPELL,
  PRINTING_1,
  PRINTING_2,
} from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { friendGroupMatchesRepo } from "./friend-group-matches.js";
import { friendGroupsRepo } from "./friend-groups.js";

const VIEWER_ID = crypto.randomUUID();
const ADMIN_ID = crypto.randomUUID();
const SELLER_ID = crypto.randomUUID();
const OUTSIDER_ID = crypto.randomUUID();

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
  /** Throwaway users a single test seeds, deleted alongside the file-owned four. */
  const createdUserIds: string[] = [];

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
    // Users are file-owned; delete them last, once nothing references them.
    await db
      .deleteFrom("users")
      .where("id", "in", [VIEWER_ID, ADMIN_ID, SELLER_ID, OUTSIDER_ID, ...createdUserIds])
      .execute();
  });

  // Restore any users a test deleted (cascade scenarios) BEFORE the next test —
  // otherwise later tests that reference VIEWER_ID/OUTSIDER_ID hit the
  // friend_group_members_user_id FK. (Deleting in afterAll left them gone for
  // the rest of the suite.)
  afterEach(async () => {
    for (const userId of recreatedUserIds) {
      await seedTestUser(db, { id: userId });
    }
    recreatedUserIds.length = 0;
  });

  beforeAll(async () => {
    // Seed the four file-owned users. Some tests delete them as part of a
    // cascade scenario; afterEach recreates any that were removed.
    for (const id of [VIEWER_ID, ADMIN_ID, SELLER_ID, OUTSIDER_ID]) {
      await seedTestUser(db, { id });
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

  it("creates a group with the creator as the sole owner", async () => {
    const group = await createGroup(VIEWER_ID);
    const members = await repo.listMembers(group.id);
    expect(members).toHaveLength(1);
    expect(members[0]?.userId).toBe(VIEWER_ID);
    expect(members[0]?.role).toBe("owner");
  });

  it("listMembers orders by role, then by name case-insensitively", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, ADMIN_ID, "admin");
    await repo.addMember(group.id, SELLER_ID, "member");
    await repo.addMember(group.id, OUTSIDER_ID, "member");
    // Names chosen so that lower-cased ordering ("alice" < "Bob") differs from
    // raw byte ordering ("Bob" < "alice"), proving the lower(u.name) sort.
    await db.updateTable("users").set({ name: "alice" }).where("id", "=", SELLER_ID).execute();
    await db.updateTable("users").set({ name: "Bob" }).where("id", "=", OUTSIDER_ID).execute();

    const members = await repo.listMembers(group.id);
    expect(members.map((member) => member.userId)).toEqual([
      VIEWER_ID, // owner
      ADMIN_ID, // admin
      SELLER_ID, // member "alice"
      OUTSIDER_ID, // member "Bob"
    ]);

    // Restore the shared seed name so later tests see the original fixture.
    await db
      .updateTable("users")
      .set({ name: "Test User" })
      .where("id", "in", [SELLER_ID, OUTSIDER_ID])
      .execute();
  });

  it("sharedGroups returns every group both users are in, sorted by name", async () => {
    // Fresh users, because the file-owned four already share groups from
    // earlier tests and this asserts on the whole result, not a subset.
    const alice = await seedTestUser(db);
    const bob = await seedTestUser(db);
    createdUserIds.push(alice.id, bob.id);

    const zaun = await createGroup(alice.id);
    const piltover = await createGroup(alice.id);
    const aliceOnly = await createGroup(alice.id);
    await repo.addMember(zaun.id, bob.id, "member");
    await repo.addMember(piltover.id, bob.id, "member");
    // Names chosen so lower-cased ordering ("piltover" < "Zaun") differs from
    // raw byte ordering, proving the lower(g.name) sort.
    await db
      .updateTable("friendGroups")
      .set({ name: "Zaun Runners" })
      .where("id", "=", zaun.id)
      .execute();
    await db
      .updateTable("friendGroups")
      .set({ name: "piltover pact" })
      .where("id", "=", piltover.id)
      .execute();

    const shared = await repo.sharedGroups(alice.id, bob.id);
    expect(shared.map((group) => group.id)).toEqual([piltover.id, zaun.id]);
    expect(shared[0]).toEqual({ id: piltover.id, slug: piltover.slug, name: "piltover pact" });
    // A group only one of them is in never counts as shared.
    expect(shared.map((group) => group.id)).not.toContain(aliceOnly.id);
    // The relation is symmetric — the sheet works from either side.
    const reversed = await repo.sharedGroups(bob.id, alice.id);
    expect(reversed.map((group) => group.id)).toEqual([piltover.id, zaun.id]);
  });

  it("sharedGroups is empty for two users with no group in common", async () => {
    const alice = await seedTestUser(db);
    const stranger = await seedTestUser(db);
    createdUserIds.push(alice.id, stranger.id);
    const group = await createGroup(alice.id);
    await repo.addMember(group.id, VIEWER_ID, "member");

    expect(await repo.sharedGroups(alice.id, stranger.id)).toEqual([]);
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

  it("listOwnRequestsForUser returns only the requests the user made themselves", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.createInvite(group.id, SELLER_ID, "request");

    const requests = await repo.listOwnRequestsForUser(SELLER_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.groupId).toBe(group.id);
    expect(requests[0]?.groupSlug).toBe(group.slug);
    expect(requests[0]?.groupName).toBe(group.name);

    expect(await repo.listOwnRequestsForUser(ADMIN_ID)).toHaveLength(0);

    // Requesters see the group's size but never its roster.
    expect(requests[0]?.memberCount).toBe(1);
    expect(requests[0]).not.toHaveProperty("memberPreviews");
  });

  it("listGroupsForUser returns counts and roster-ordered member previews capped at five", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, ADMIN_ID, "admin");
    await repo.addMember(group.id, SELLER_ID, "member");
    await repo.addMember(group.id, OUTSIDER_ID, "member");
    // Two throwaway members push the roster past the preview limit.
    const extraA = await seedTestUser(db);
    const extraB = await seedTestUser(db);
    await repo.addMember(group.id, extraA.id, "member");
    await repo.addMember(group.id, extraB.id, "member");
    // Same trick as the listMembers test: lower-cased ordering ("alice" <
    // "Bob") differs from raw byte ordering, proving the preview sort.
    await db.updateTable("users").set({ name: "alice" }).where("id", "=", SELLER_ID).execute();
    await db.updateTable("users").set({ name: "Bob" }).where("id", "=", OUTSIDER_ID).execute();
    await db
      .updateTable("users")
      .set({ name: "zed" })
      .where("id", "in", [extraA.id, extraB.id])
      .execute();

    const list = await createList(VIEWER_ID, "trade", "copy");
    await repo.share(group.id, list.id, VIEWER_ID);

    const summaries = await repo.listGroupsForUser(VIEWER_ID);
    const summary = summaries.find((row) => row.id === group.id);
    expect(summary?.memberCount).toBe(6);
    expect(summary?.sharedListCount).toBe(1);
    // Owner first, then admin, then members by name; the sixth member is cut.
    expect(summary?.memberPreviews.map((preview) => preview.userId)).toEqual([
      VIEWER_ID,
      ADMIN_ID,
      SELLER_ID,
      OUTSIDER_ID,
      extraA.id,
    ]);

    // Restore the shared fixture names and drop the throwaway users.
    await db
      .updateTable("users")
      .set({ name: "Test User" })
      .where("id", "in", [SELLER_ID, OUTSIDER_ID])
      .execute();
    await db.deleteFrom("users").where("id", "in", [extraA.id, extraB.id]).execute();
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

  it("getBySlugOrPrevious resolves a rename alias; exact getBySlug does not", async () => {
    const group = await createGroup(VIEWER_ID);
    const oldSlug = group.slug;
    const newSlug = await uniqueSlug("fg-ren");

    await repo.update(group.id, { slug: newSlug, previousSlug: oldSlug, updatedAt: new Date() });

    const byOld = await repo.getBySlugOrPrevious(oldSlug);
    expect(byOld?.id).toBe(group.id);
    expect(byOld?.slug).toBe(newSlug);
    const byNew = await repo.getBySlugOrPrevious(newSlug);
    expect(byNew?.id).toBe(group.id);

    // Conflict checks depend on the exact lookup NOT resolving aliases.
    expect(await repo.getBySlug(oldSlug)).toBeUndefined();
  });

  it("a group's current slug beats another group's stale rename alias", async () => {
    const groupA = await createGroup(VIEWER_ID);
    const contestedSlug = groupA.slug;
    const movedSlug = await uniqueSlug("fg-mv");
    await repo.update(groupA.id, {
      slug: movedSlug,
      previousSlug: contestedSlug,
      updatedAt: new Date(),
    });

    // A new group claims the freed slug; lookups must prefer it over the alias.
    const groupB = await repo.createWithOwner(
      { slug: contestedSlug, name: "Claimer", description: null, code: null },
      VIEWER_ID,
    );
    createdGroupIds.push(groupB.id);

    const resolved = await repo.getBySlugOrPrevious(contestedSlug);
    expect(resolved?.id).toBe(groupB.id);
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

  // Guards against a scenario where the promote is unguarded: transferring to
  // someone who is not a member would update nothing while the demote still
  // commits, leaving the group with no owner and no owner-only action to fix it.
  it("rolls back a transfer to a non-member, keeping the current owner", async () => {
    const group = await createGroup(VIEWER_ID);

    await expect(repo.transferOwnership(group.id, VIEWER_ID, OUTSIDER_ID)).rejects.toThrow(
      /is not a member/u,
    );

    const viewer = await repo.getMembership(group.id, VIEWER_ID);
    expect(viewer?.role).toBe("owner");
    expect(await repo.getMembership(group.id, OUTSIDER_ID)).toBeUndefined();
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

  // A pending offer counts as a claim on the copy (`assertSupplyAvailable`),
  // so the match view must not advertise a copy already promised elsewhere.
  it("a pending offer to another member hides the copy from the match view", async () => {
    const group = await createGroup(VIEWER_ID);
    await repo.addMember(group.id, SELLER_ID, "member");
    await repo.addMember(group.id, OUTSIDER_ID, "member");

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
      .values({ listId: trade.id, userId: SELLER_ID, kind: "copy", copyId: copy.id, quantity: 1 })
      .execute();
    await repo.share(group.id, trade.id, SELLER_ID);

    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(1);

    // The seller offers that same copy to the outsider. Nothing is pinned until
    // the outsider accepts, so the copy is not `reserved` — only the claim pass
    // takes it off the table.
    const offer = await db
      .insertInto("cardTrades")
      .values({
        groupId: group.id,
        giverUserId: SELLER_ID,
        receiverUserId: OUTSIDER_ID,
        initiator: "giver",
        printingId: PRINTING_1.id,
        cardId: CARD_FURY_UNIT.id,
        quantity: 1,
        status: "pending",
        // A pending trade always carries its TTL (enforced by a CHECK constraint).
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(0);

    // A request in the other direction is a bid, not a commitment, so it must
    // not hide anything.
    await db
      .updateTable("cardTrades")
      .set({ initiator: "receiver", giverUserId: OUTSIDER_ID, receiverUserId: SELLER_ID })
      .where("id", "=", offer.id)
      .execute();
    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
    ).toHaveLength(1);

    // A closed offer releases the copy too. Closing stamps closed_at and
    // clears the TTL, as every real writer does (enforced by shape CHECKs).
    await db
      .updateTable("cardTrades")
      .set({
        initiator: "giver",
        giverUserId: SELLER_ID,
        receiverUserId: OUTSIDER_ID,
        status: "cancelled",
        closedAt: new Date(),
        expiresAt: null,
      })
      .where("id", "=", offer.id)
      .execute();
    expect(
      await matches.othersHaveYourWants({ groupId: group.id, viewerUserId: VIEWER_ID }),
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
