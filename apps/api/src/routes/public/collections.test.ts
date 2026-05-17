import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { publicCollectionsRoute } from "./collections";

const mockCollectionsRepo = {
  findByShareToken: vi.fn(
    () =>
      Promise.resolve(undefined) as Promise<
        { collection: Record<string, unknown>; ownerName: string | null } | undefined
      >,
  ),
};

const mockCopiesRepo = {
  listForCollection: vi.fn(() => Promise.resolve([] as object[])),
};

const mockMarketplaceRepo = {
  singleCollectionValue: vi.fn(() => Promise.resolve(undefined)),
};

const mockUserPreferencesRepo = {
  getByUserId: vi.fn(() => Promise.resolve(undefined)),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", {
      collections: mockCollectionsRepo,
      copies: mockCopiesRepo,
      marketplace: mockMarketplaceRepo,
      userPreferences: mockUserPreferencesRepo,
    } as never);
    await next();
  })
  .route("/api/v1", publicCollectionsRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 404);
    }
    throw err;
  });

const COLLECTION_ID = "a0000000-0001-4000-a000-000000000010";
const USER_ID = "a0000000-0001-4000-a000-000000000001";
const NOW = new Date("2026-04-20T00:00:00Z");

const dbCollection = {
  id: COLLECTION_ID,
  userId: USER_ID,
  name: "Main Binder",
  description: "My main collection",
  availableForDeckbuilding: true,
  isInbox: false,
  sortOrder: 0,
  isPublic: true,
  shareToken: "tok-abc",
  createdAt: NOW,
  updatedAt: NOW,
};

const dbInbox = {
  ...dbCollection,
  id: "a0000000-0001-4000-a000-000000000011",
  name: "Inbox",
  isInbox: true,
};

const dbCopy = {
  id: "a0000000-0001-4000-a000-000000000020",
  printingId: "OGS-001:rare:normal:",
  collectionId: COLLECTION_ID,
  createdAt: NOW,
};

describe("GET /api/v1/collections/share/:token", () => {
  beforeEach(() => {
    mockCollectionsRepo.findByShareToken.mockReset();
    mockCopiesRepo.listForCollection.mockReset();
    mockMarketplaceRepo.singleCollectionValue.mockReset();
    mockUserPreferencesRepo.getByUserId.mockReset();
    mockUserPreferencesRepo.getByUserId.mockResolvedValue(undefined);
  });

  it("returns 200 with the collection, copies, value, and owner display name", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: dbCollection,
      ownerName: "Alice",
    });
    mockCopiesRepo.listForCollection.mockResolvedValue([dbCopy]);
    mockMarketplaceRepo.singleCollectionValue.mockResolvedValue({
      collectionId: COLLECTION_ID,
      totalValueCents: 1234,
      unpricedCopyCount: 2,
    });

    const res = await app.request("/api/v1/collections/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.collection.id).toBe(COLLECTION_ID);
    expect(json.collection.name).toBe("Main Binder");
    expect(json.collection.totalValueCents).toBe(1234);
    expect(json.collection.unpricedCopyCount).toBe(2);
    expect(json.copies).toHaveLength(1);
    expect(json.copies[0].id).toBe(dbCopy.id);
    expect(json.owner.displayName).toBe("Alice");
    expect(json.nextCursor).toBeNull();
  });

  it("excludes owner-only fields (shareToken, isPublic, isInbox, availableForDeckbuilding) from the response", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: dbCollection,
      ownerName: "Alice",
    });
    mockCopiesRepo.listForCollection.mockResolvedValue([]);

    const res = await app.request("/api/v1/collections/share/tok-abc");
    const json = await res.json();
    expect(json.collection).not.toHaveProperty("shareToken");
    expect(json.collection).not.toHaveProperty("isPublic");
    expect(json.collection).not.toHaveProperty("isInbox");
    expect(json.collection).not.toHaveProperty("availableForDeckbuilding");
    expect(json.collection).not.toHaveProperty("sortOrder");
    expect(json.collection).not.toHaveProperty("userId");
  });

  it("falls back to 'Anonymous' when the owner has no display name", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: dbCollection,
      ownerName: null,
    });
    mockCopiesRepo.listForCollection.mockResolvedValue([]);

    const res = await app.request("/api/v1/collections/share/tok-abc");
    const json = await res.json();
    expect(json.owner.displayName).toBe("Anonymous");
  });

  it("returns 404 when the token is not found or the collection is not public", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/collections/share/unknown");
    expect(res.status).toBe(404);
    expect(mockCopiesRepo.listForCollection).not.toHaveBeenCalled();
  });

  it("returns nextCursor when copy count exceeds the requested limit", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: dbCollection,
      ownerName: "Alice",
    });
    const items = Array.from({ length: 11 }, (_, idx) => ({
      ...dbCopy,
      id: `a0000000-0001-4000-a000-${String(idx).padStart(12, "0")}`,
      createdAt: new Date(NOW.getTime() - idx * 1000),
    }));
    mockCopiesRepo.listForCollection.mockResolvedValue(items);

    const res = await app.request("/api/v1/collections/share/tok-abc?limit=10");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.copies).toHaveLength(10);
    expect(json.nextCursor).toBeTruthy();
  });

  it("returns inbox collections too (inbox is shareable like any other)", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: dbInbox,
      ownerName: "Alice",
    });
    mockCopiesRepo.listForCollection.mockResolvedValue([]);

    const res = await app.request("/api/v1/collections/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.collection.id).toBe(dbInbox.id);
  });

  it("sets a public cache-control header for browsers and CDNs", async () => {
    mockCollectionsRepo.findByShareToken.mockResolvedValue({
      collection: dbCollection,
      ownerName: "Alice",
    });
    mockCopiesRepo.listForCollection.mockResolvedValue([]);

    const res = await app.request("/api/v1/collections/share/tok-abc");
    expect(res.headers.get("cache-control")).toMatch(/public/u);
  });
});
