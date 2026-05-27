import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { userSharesRepo } from "./user-shares.js";

const OWNER = {
  userId: "u1",
  displayName: "Test User",
  email: "test@example.com",
  image: null,
};

const LIST = {
  id: "lst-1",
  userId: "u1",
  name: "Wants",
  intent: "wish" as const,
  kind: "card" as const,
  isPublic: false,
  shareToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("userSharesRepo", () => {
  it("setShareToken returns the updated token", async () => {
    const db = createMockDb([{ shareToken: "abc" }]);
    const repo = userSharesRepo(db);
    expect(await repo.setShareToken("u1", "abc")).toEqual({ shareToken: "abc" });
  });

  it("setShareToken can revoke by passing null", async () => {
    const db = createMockDb([{ shareToken: null }]);
    const repo = userSharesRepo(db);
    expect(await repo.setShareToken("u1", null)).toEqual({ shareToken: null });
  });

  it("getShareToken returns the user's current state", async () => {
    const db = createMockDb([{ shareToken: "abc" }]);
    const repo = userSharesRepo(db);
    expect(await repo.getShareToken("u1")).toEqual({ shareToken: "abc" });
  });

  it("findOwnerByShareToken returns the owner profile", async () => {
    const db = createMockDb([OWNER]);
    const repo = userSharesRepo(db);
    expect(await repo.findOwnerByShareToken("abc")).toEqual(OWNER);
  });

  it("findOwnerByShareToken returns undefined when no match", async () => {
    const db = createMockDb([]);
    const repo = userSharesRepo(db);
    expect(await repo.findOwnerByShareToken("abc")).toBeUndefined();
  });

  it("listsForOwner returns lists with entry counts", async () => {
    const db = createMockDb([{ ...LIST, entryCount: 3 }]);
    const repo = userSharesRepo(db);
    expect(await repo.listsForOwner("u1", null)).toEqual([{ list: LIST, entryCount: 3 }]);
  });

  it("listsForOwner defaults a null entryCount to zero", async () => {
    const db = createMockDb([{ ...LIST, entryCount: null }]);
    const repo = userSharesRepo(db);
    expect(await repo.listsForOwner("u1", null)).toEqual([{ list: LIST, entryCount: 0 }]);
  });

  it("findListInBundle returns the list when it belongs to the token's owner", async () => {
    const db = createMockDb([LIST]);
    const repo = userSharesRepo(db);
    expect(await repo.findListInBundle("abc", "lst-1", null)).toEqual(LIST);
  });
});
