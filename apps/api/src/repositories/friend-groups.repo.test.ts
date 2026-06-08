import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { friendGroupsRepo } from "./friend-groups.js";

const GROUP = {
  id: "grp-1",
  slug: "playgroup",
  name: "Tuesday Night Crew",
  description: null,
  code: "ABCDEFGHIJKL",
  codeRotatedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MEMBER = {
  groupId: "grp-1",
  userId: "u1",
  role: "member" as const,
  nickname: null,
  joinedAt: new Date(),
};

const OWNER = { ...MEMBER, userId: "u-owner", role: "owner" as const };

const INVITE = {
  id: "inv-1",
  groupId: "grp-1",
  userId: "u2",
  direction: "invite" as const,
  createdAt: new Date(),
};

describe("friendGroupsRepo", () => {
  // ── Groups ─────────────────────────────────────────────────────────────────
  it("getById returns the group", async () => {
    const repo = friendGroupsRepo(createMockDb([GROUP]));
    expect(await repo.getById("grp-1")).toEqual(GROUP);
  });

  it("getBySlug returns the group", async () => {
    const repo = friendGroupsRepo(createMockDb([GROUP]));
    expect(await repo.getBySlug("playgroup")).toEqual(GROUP);
  });

  it("getByCode returns the group", async () => {
    const repo = friendGroupsRepo(createMockDb([GROUP]));
    expect(await repo.getByCode("ABCDEFGHIJKL")).toEqual(GROUP);
  });

  it("createWithOwner returns the group from the transaction", async () => {
    const repo = friendGroupsRepo(createMockDb([GROUP]));
    expect(
      await repo.createWithOwner(
        { slug: "playgroup", name: "Tuesday Night Crew", description: null, code: null },
        "u-owner",
      ),
    ).toEqual(GROUP);
  });

  it("update returns the patched row", async () => {
    const repo = friendGroupsRepo(createMockDb([GROUP]));
    expect(await repo.update("grp-1", { name: "New Name" })).toEqual(GROUP);
  });

  it("setCode returns the patched row", async () => {
    const repo = friendGroupsRepo(createMockDb([GROUP]));
    expect(await repo.setCode("grp-1", null)).toEqual(GROUP);
  });

  it("deleteById resolves without throwing", async () => {
    const repo = friendGroupsRepo(createMockDb([]));
    await expect(repo.deleteById("grp-1")).resolves.toBeUndefined();
  });

  // ── Membership ────────────────────────────────────────────────────────────
  it("getMembership returns the row", async () => {
    const repo = friendGroupsRepo(createMockDb([MEMBER]));
    expect(await repo.getMembership("grp-1", "u1")).toEqual(MEMBER);
  });

  it("listMembers returns enriched rows", async () => {
    const enriched = {
      ...OWNER,
      userName: "Owner",
      userEmail: "owner@example.com",
      userImage: null,
    };
    const repo = friendGroupsRepo(createMockDb([enriched]));
    expect(await repo.listMembers("grp-1")).toEqual([enriched]);
  });

  it("listGroupsForUser coerces sub-select counts to numbers", async () => {
    const raw = {
      ...GROUP,
      viewerRole: "owner",
      memberCount: null, // simulate the worst-case typing
      pendingRequestCount: 2n,
    };
    const repo = friendGroupsRepo(createMockDb([raw]));
    const [row] = await repo.listGroupsForUser("u-owner");
    expect(row?.memberCount).toBe(0);
    expect(row?.pendingRequestCount).toBe(2);
  });

  it("addMember and removeMember resolve without throwing", async () => {
    const repo = friendGroupsRepo(createMockDb([]));
    await expect(repo.addMember("grp-1", "u1", "member")).resolves.toBeUndefined();
    await expect(repo.removeMember("grp-1", "u1")).resolves.toBeUndefined();
  });

  it("updateRole returns the patched row", async () => {
    const repo = friendGroupsRepo(createMockDb([MEMBER]));
    expect(await repo.updateRole("grp-1", "u1", "admin")).toEqual(MEMBER);
  });

  it("updateNickname returns the patched row", async () => {
    const repo = friendGroupsRepo(createMockDb([MEMBER]));
    expect(await repo.updateNickname("grp-1", "u1", "Tuesday Alice")).toEqual(MEMBER);
  });

  it("transferOwnership resolves without throwing", async () => {
    const repo = friendGroupsRepo(createMockDb([]));
    await expect(repo.transferOwnership("grp-1", "u-owner", "u1")).resolves.toBeUndefined();
  });

  // ── Invites ───────────────────────────────────────────────────────────────
  it("getInvite returns the row", async () => {
    const repo = friendGroupsRepo(createMockDb([INVITE]));
    expect(await repo.getInvite("grp-1", "u2")).toEqual(INVITE);
  });

  it("listInvitesForUser returns enriched rows", async () => {
    const enriched = { ...INVITE, groupName: "Tuesday Night Crew", groupSlug: "playgroup" };
    const repo = friendGroupsRepo(createMockDb([enriched]));
    expect(await repo.listInvitesForUser("u2")).toEqual([enriched]);
  });

  it("listRequestsForGroup returns enriched rows", async () => {
    const enriched = {
      ...INVITE,
      direction: "request" as const,
      userName: "Requester",
      userEmail: "requester@example.com",
      userImage: null,
    };
    const repo = friendGroupsRepo(createMockDb([enriched]));
    expect(await repo.listRequestsForGroup("grp-1")).toEqual([enriched]);
  });

  it("pendingInvitesCountForUser returns the count", async () => {
    const repo = friendGroupsRepo(createMockDb([{ count: 3 }]));
    expect(await repo.pendingInvitesCountForUser("u2")).toBe(3);
  });

  it("pendingRequestsCountForUser returns the count", async () => {
    const repo = friendGroupsRepo(createMockDb([{ count: 2 }]));
    expect(await repo.pendingRequestsCountForUser("u-owner")).toBe(2);
  });

  it("pendingRequestsCountForUser coerces a missing count to 0", async () => {
    const repo = friendGroupsRepo(createMockDb([{ count: null }]));
    expect(await repo.pendingRequestsCountForUser("u-owner")).toBe(0);
  });

  it("createInvite and deleteInvite resolve without throwing", async () => {
    const repo = friendGroupsRepo(createMockDb([]));
    await expect(repo.createInvite("grp-1", "u2", "invite")).resolves.toBeUndefined();
    await expect(repo.deleteInvite("grp-1", "u2")).resolves.toBeUndefined();
  });

  // ── Shares ────────────────────────────────────────────────────────────────
  it("listSharesForGroup returns enriched rows", async () => {
    const row = {
      groupId: "grp-1",
      listId: "lst-1",
      userId: "u1",
      sharedAt: new Date(),
      listName: "My Wants",
      listIntent: "wish",
      listKind: "card",
      entryCount: 3,
      userName: "Alice",
    };
    const repo = friendGroupsRepo(createMockDb([row]));
    expect(await repo.listSharesForGroup("grp-1")).toEqual([row]);
  });

  it("listShareableForUserInGroup returns annotated lists", async () => {
    const row = {
      listId: "lst-1",
      listName: "My Wants",
      listIntent: "wish",
      listKind: "card",
      entryCount: 12,
      sharedAt: null,
    };
    const repo = friendGroupsRepo(createMockDb([row]));
    expect(await repo.listShareableForUserInGroup("grp-1", "u1")).toEqual([row]);
  });

  it("listGroupsSharingList returns slug + name rows", async () => {
    const row = { groupId: "grp-1", groupSlug: "playgroup", groupName: "Tuesday Night Crew" };
    const repo = friendGroupsRepo(createMockDb([row]));
    expect(await repo.listGroupsSharingList("lst-1")).toEqual([row]);
  });

  it("share and unshare resolve without throwing", async () => {
    const repo = friendGroupsRepo(createMockDb([]));
    await expect(repo.share("grp-1", "lst-1", "u1")).resolves.toBeUndefined();
    await expect(repo.unshare("grp-1", "lst-1")).resolves.toBeUndefined();
  });
});
