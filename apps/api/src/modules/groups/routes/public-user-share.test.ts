import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { publicUserShareRouter } from "./public-user-share";

const mockUserSharesRepo = {
  findOwnerByShareToken: vi.fn(),
  listsForOwner: vi.fn(),
  findListInBundle: vi.fn(),
};

const mockFriendGroupsRepo = {
  collectionsBundleForViewer: vi.fn(),
};

const mockListsRepo = {
  entriesWithDetailsAnon: vi.fn(),
  expandedCounts: vi.fn(),
};

let currentUser: { id: string } | null = null;

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  if (currentUser) {
    c.set("user", currentUser as never);
  }
  c.set("repos", {
    userShares: mockUserSharesRepo,
    friendGroups: mockFriendGroupsRepo,
    lists: mockListsRepo,
  } as never);
  await next();
});
registerRouterForTest(app, publicUserShareRouter);

const OWNER_ID = "a0000000-0001-4000-a000-000000000001";
const LIST_ID = "a0000000-0001-4000-a000-000000000010";
const NOW = new Date("2026-04-20T00:00:00Z");

const dbOwner = {
  userId: OWNER_ID,
  displayName: "Alice",
  email: "alice@example.com",
  image: null,
};

const dbList = {
  id: LIST_ID,
  userId: OWNER_ID,
  name: "Trade Binder",
  intent: "trade" as const,
  kind: "card" as const,
  shareToken: "list-tok",
  createdAt: NOW,
  updatedAt: NOW,
  defaultPricePref: null,
  defaultPriceAbsoluteCents: null,
  defaultTradeType: null,
  currency: null,
};

const dbEntry = {
  kind: "card" as const,
  id: "a0000000-0001-4000-a000-000000000020",
  listId: LIST_ID,
  quantity: 2,
  ruleQuantity: 0,
  source: "manual" as const,
  cardId: "c0000000-0001-4000-a000-000000000001",
  cardName: "Jinx, Rebel",
  tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
};

describe("GET /api/v1/users/share/:token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser = null;
  });

  it("returns 200 with the owner profile and visible lists", async () => {
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue(dbOwner);
    mockUserSharesRepo.listsForOwner.mockResolvedValue([
      { list: dbList, entryCount: 3, viaGroups: [] },
    ]);

    const res = await app.request("/api/v1/users/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.owner.displayName).toBe("Alice");
    expect(json.owner.gravatarHash).toEqual(expect.any(String));
    expect(json.lists).toHaveLength(1);
    expect(json.lists[0]).toMatchObject({
      id: LIST_ID,
      name: "Trade Binder",
      intent: "trade",
      kind: "card",
      entryCount: 3,
      isPublic: true,
      viaGroups: [],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(json.collections).toEqual([]);
    expect(mockFriendGroupsRepo.collectionsBundleForViewer).not.toHaveBeenCalled();
  });

  it("expands rule-based lists so their entryCount is the real size", async () => {
    const ruledList = {
      ...dbList,
      id: "a0000000-0001-4000-a000-000000000011",
      name: "Smart Trades",
      rules: [{ kind: "trade", filter: {} }],
    };
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue(dbOwner);
    mockUserSharesRepo.listsForOwner.mockResolvedValue([
      { list: dbList, entryCount: 3, viaGroups: [] },
      { list: ruledList, entryCount: 0, viaGroups: [] },
    ]);
    mockListsRepo.expandedCounts.mockResolvedValue(new Map([[ruledList.id, 4]]));

    const res = await app.request("/api/v1/users/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const byId = new Map(
      (json.lists as { id: string; entryCount: number }[]).map((l) => [l.id, l.entryCount]),
    );
    expect(byId.get(dbList.id)).toBe(3);
    expect(byId.get(ruledList.id)).toBe(4);
    expect(mockListsRepo.expandedCounts).toHaveBeenCalledTimes(1);
    expect(mockListsRepo.expandedCounts).toHaveBeenCalledWith([ruledList.id]);
    expect(mockListsRepo.entriesWithDetailsAnon).not.toHaveBeenCalled();
  });

  it("includes group-shared collections for an authenticated viewer", async () => {
    currentUser = { id: "v0000000-0001-4000-a000-000000000099" };
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue(dbOwner);
    mockUserSharesRepo.listsForOwner.mockResolvedValue([]);
    mockFriendGroupsRepo.collectionsBundleForViewer.mockResolvedValue([
      {
        collectionId: "col-1",
        collectionName: "Main",
        collectionDescription: "My cards",
        viaGroups: [{ id: "g1", slug: "buds", name: "Buds" }],
      },
    ]);

    const res = await app.request("/api/v1/users/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.collections).toEqual([
      {
        id: "col-1",
        name: "Main",
        description: "My cards",
        viaGroups: [{ id: "g1", slug: "buds", name: "Buds" }],
      },
    ]);
    expect(mockFriendGroupsRepo.collectionsBundleForViewer).toHaveBeenCalledWith(
      OWNER_ID,
      currentUser.id,
    );
  });

  it("falls back to 'Anonymous' when the owner has no display name", async () => {
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue({
      ...dbOwner,
      displayName: null,
    });
    mockUserSharesRepo.listsForOwner.mockResolvedValue([]);

    const res = await app.request("/api/v1/users/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.owner.displayName).toBe("Anonymous");
  });

  it("returns 404 when the token does not resolve to an owner", async () => {
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/users/share/unknown");
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockUserSharesRepo.listsForOwner).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/users/share/:token/lists/:listId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser = null;
  });

  it("returns 200 with the list, entries, and owner", async () => {
    mockUserSharesRepo.findListInBundle.mockResolvedValue(dbList);
    mockUserSharesRepo.findOwnerByShareToken.mockResolvedValue(dbOwner);
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([dbEntry]);

    const res = await app.request(`/api/v1/users/share/tok-abc/lists/${LIST_ID}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.list.id).toBe(LIST_ID);
    expect(json.list.name).toBe("Trade Binder");
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0]).toMatchObject({ id: dbEntry.id, cardName: "Jinx, Rebel" });
    expect(json.owner.displayName).toBe("Alice");
    expect(mockListsRepo.entriesWithDetailsAnon).toHaveBeenCalledWith(LIST_ID, dbList.kind);
  });

  it("returns 404 when the list is not visible in the bundle", async () => {
    mockUserSharesRepo.findListInBundle.mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/users/share/tok-abc/lists/${LIST_ID}`);
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockListsRepo.entriesWithDetailsAnon).not.toHaveBeenCalled();
  });

  it("returns 400 when the listId is not a UUID", async () => {
    const res = await app.request("/api/v1/users/share/tok-abc/lists/not-a-uuid");
    expect(res.status).toBe(400);
    expect(mockUserSharesRepo.findListInBundle).not.toHaveBeenCalled();
  });
});
