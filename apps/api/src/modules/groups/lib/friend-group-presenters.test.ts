import { describe, expect, it } from "vitest";

import { gravatarHashForEmail } from "../../users/lib/gravatar.js";
import type {
  Group,
  MemberPreviewRow,
  MemberWithUser,
} from "../repositories/friend-groups-shared.js";
import type {
  CollectionCoverRow,
  CollectionShareRow,
  PendingRequestRow,
  ShareRow,
} from "./friend-group-presenters.js";
import {
  canSeeCode,
  groupCovers,
  toCollectionShare,
  toGroup,
  toMember,
  toMemberPreview,
  toRequest,
  toShare,
} from "./friend-group-presenters.js";

const GROUP_ID = "group-1";
const USER_ID = "user-1";

function groupRow(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP_ID,
    slug: "summoner-skirmish",
    previousSlug: null,
    name: "Summoner Skirmish",
    description: "Tuesday nights",
    code: "ABCDEFGHIJKL",
    codeRotatedAt: new Date("2026-03-01T10:00:00.000Z"),
    createdAt: new Date("2026-02-01T10:00:00.000Z"),
    updatedAt: new Date("2026-03-02T10:00:00.000Z"),
    ...overrides,
  };
}

describe("toGroup", () => {
  it("serializes the dates and keeps the code when the viewer may see it", () => {
    expect(toGroup(groupRow(), true)).toEqual({
      id: GROUP_ID,
      slug: "summoner-skirmish",
      name: "Summoner Skirmish",
      description: "Tuesday nights",
      code: "ABCDEFGHIJKL",
      codeRotatedAt: "2026-03-01T10:00:00.000Z",
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-03-02T10:00:00.000Z",
    });
  });

  it("nulls the code when the viewer may not see it", () => {
    expect(toGroup(groupRow(), false).code).toBeNull();
  });
});

describe("canSeeCode", () => {
  it("admits owners and admins only", () => {
    expect(canSeeCode("owner")).toBe(true);
    expect(canSeeCode("admin")).toBe(true);
    expect(canSeeCode("member")).toBe(false);
  });
});

describe("toMemberPreview", () => {
  it("hashes the email instead of exposing it", () => {
    const row: MemberPreviewRow = {
      userId: USER_ID,
      userName: "Ekko",
      userImage: null,
      userEmail: " Ekko@Example.COM ",
    };
    expect(toMemberPreview(row)).toEqual({
      userId: USER_ID,
      userName: "Ekko",
      userImage: null,
      gravatarHash: gravatarHashForEmail("ekko@example.com"),
    });
    expect(toMemberPreview(row)).not.toHaveProperty("userEmail");
  });
});

describe("toMember", () => {
  it("carries the role, the joined date and the passed contact methods", () => {
    const row: MemberWithUser = {
      groupId: GROUP_ID,
      userId: USER_ID,
      userName: "Jinx",
      userImage: "https://cdn.example/jinx.png",
      userEmail: "jinx@example.com",
      role: "admin",
      joinedAt: new Date("2026-02-10T08:00:00.000Z"),
    };
    expect(toMember(row, [])).toEqual({
      userId: USER_ID,
      userName: "Jinx",
      userImage: "https://cdn.example/jinx.png",
      gravatarHash: gravatarHashForEmail("jinx@example.com"),
      role: "admin",
      contactMethods: [],
      joinedAt: "2026-02-10T08:00:00.000Z",
    });
  });
});

describe("toShare", () => {
  it("passes the entry count through untouched", () => {
    const row: ShareRow = {
      groupId: GROUP_ID,
      listId: "list-1",
      userId: USER_ID,
      sharedAt: new Date("2026-03-05T12:00:00.000Z"),
      listName: "Trade binder",
      listIntent: "trade",
      listKind: "printing",
      entryCount: 12,
      userName: "Ekko",
    };
    expect(toShare(row)).toEqual({
      groupId: GROUP_ID,
      listId: "list-1",
      listName: "Trade binder",
      listIntent: "trade",
      listKind: "printing",
      entryCount: 12,
      userId: USER_ID,
      userName: "Ekko",
      sharedAt: "2026-03-05T12:00:00.000Z",
    });
  });
});

describe("groupCovers", () => {
  it("buckets cover rows by collection", () => {
    const rows: CollectionCoverRow[] = [
      { collectionId: "c1", printingId: "p1", imageId: "i1" },
      { collectionId: "c2", printingId: "p2", imageId: "i2" },
      { collectionId: "c1", printingId: "p3", imageId: "i3" },
    ];
    const grouped = groupCovers(rows);
    expect(grouped.get("c1")).toHaveLength(2);
    expect(grouped.get("c2")).toHaveLength(1);
    expect(grouped.get("c3")).toBeUndefined();
  });
});

describe("toCollectionShare", () => {
  const row: CollectionShareRow = {
    groupId: GROUP_ID,
    collectionId: "c1",
    userId: USER_ID,
    sharedAt: new Date("2026-03-06T09:00:00.000Z"),
    collectionName: "Main binder",
    userName: "Ekko",
    copyCount: 40,
  };

  it("maps covers to printing and image ids", () => {
    expect(
      toCollectionShare(row, [{ collectionId: "c1", printingId: "p1", imageId: "i1" }]),
    ).toEqual({
      groupId: GROUP_ID,
      collectionId: "c1",
      collectionName: "Main binder",
      userId: USER_ID,
      userName: "Ekko",
      sharedAt: "2026-03-06T09:00:00.000Z",
      copyCount: 40,
      coverPrintings: [{ printingId: "p1", imageId: "i1" }],
    });
  });

  it("returns an empty cover list when none were loaded", () => {
    expect(toCollectionShare(row).coverPrintings).toEqual([]);
  });
});

describe("toRequest", () => {
  it("hashes the requester email", () => {
    const row: PendingRequestRow = {
      id: "req-1",
      userId: USER_ID,
      createdAt: new Date("2026-03-07T07:00:00.000Z"),
      userName: "Vi",
      userEmail: "vi@example.com",
      userImage: null,
    };
    expect(toRequest(row)).toEqual({
      id: "req-1",
      userId: USER_ID,
      userName: "Vi",
      userImage: null,
      gravatarHash: gravatarHashForEmail("vi@example.com"),
      createdAt: "2026-03-07T07:00:00.000Z",
    });
  });
});
