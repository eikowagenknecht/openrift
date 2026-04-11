import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { collectionEventsRoute } from "./collection-events";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockCollectionEventsRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { collectionEvents: mockCollectionEventsRepo } as never);
    await next();
  })
  .route("/api/v1", collectionEventsRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const now = new Date("2026-03-17T00:00:00Z");

const dbEvent = {
  id: "a0000000-0001-4000-a000-000000000050",
  action: "add",
  copyId: "a0000000-0001-4000-a000-000000000020",
  printingId: "a0000000-0001-4000-a000-000000000030",
  fromCollectionId: null,
  fromCollectionName: null,
  toCollectionId: "a0000000-0001-4000-a000-000000000010",
  toCollectionName: "Inbox",
  createdAt: now,
  shortCode: "ALP-001",
  rarity: "Rare",
  imageUrl: "/card-images/ab/uuid-base",
  cardName: "Fire Dragon",
  cardType: "Unit",
  cardSuperTypes: ["Dragon"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/collection-events", () => {
  beforeEach(() => {
    mockCollectionEventsRepo.listForUser.mockReset();
  });

  it("returns 200 with list of events", async () => {
    mockCollectionEventsRepo.listForUser.mockResolvedValue([dbEvent]);
    const res = await app.request("/api/v1/collection-events");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(dbEvent.id);
    expect(json.items[0].action).toBe("add");
    expect(json.items[0].cardName).toBe("Fire Dragon");
    expect(json.nextCursor).toBeNull();
  });

  it("returns empty array when no events", async () => {
    mockCollectionEventsRepo.listForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/collection-events");
    const json = await res.json();
    expect(json.items).toEqual([]);
    expect(json.nextCursor).toBeNull();
  });

  it("defaults limit to 50 when not provided", async () => {
    mockCollectionEventsRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/collection-events");
    expect(mockCollectionEventsRepo.listForUser).toHaveBeenCalledWith(USER_ID, 50, undefined);
  });

  it("passes cursor and limit query params", async () => {
    mockCollectionEventsRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/collection-events?limit=10&cursor=2026-03-17T00:00:00.000Z");
    expect(mockCollectionEventsRepo.listForUser).toHaveBeenCalledWith(
      USER_ID,
      10,
      "2026-03-17T00:00:00.000Z",
    );
  });

  it("returns nextCursor when hasMore events", async () => {
    const items = Array.from({ length: 51 }, (_, idx) => ({
      ...dbEvent,
      id: `a0000000-0001-4000-a000-${String(idx).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - idx * 1000),
    }));
    mockCollectionEventsRepo.listForUser.mockResolvedValue(items);
    const res = await app.request("/api/v1/collection-events");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(50);
    expect(json.nextCursor).toBeTruthy();
  });

  it("returns null nextCursor when items exactly equal limit", async () => {
    const items = Array.from({ length: 50 }, (_, idx) => ({
      ...dbEvent,
      id: `a0000000-0001-4000-a000-${String(idx).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - idx * 1000),
    }));
    mockCollectionEventsRepo.listForUser.mockResolvedValue(items);
    const res = await app.request("/api/v1/collection-events");
    const json = await res.json();
    expect(json.items).toHaveLength(50);
    expect(json.nextCursor).toBeNull();
  });

  it("maps event fields correctly", async () => {
    mockCollectionEventsRepo.listForUser.mockResolvedValue([dbEvent]);
    const res = await app.request("/api/v1/collection-events");
    const json = await res.json();
    const event = json.items[0];

    expect(event.id).toBe(dbEvent.id);
    expect(event.action).toBe("add");
    expect(event.copyId).toBe(dbEvent.copyId);
    expect(event.printingId).toBe(dbEvent.printingId);
    expect(event.fromCollectionId).toBeNull();
    expect(event.fromCollectionName).toBeNull();
    expect(event.toCollectionId).toBe(dbEvent.toCollectionId);
    expect(event.toCollectionName).toBe("Inbox");
    expect(event.createdAt).toBe(now.toISOString());
    expect(event.shortCode).toBe("ALP-001");
    expect(event.rarity).toBe("Rare");
    expect(event.image).toEqual({
      full: "/card-images/ab/uuid-base-full.webp",
      thumbnail: "/card-images/ab/uuid-base-400w.webp",
    });
    expect(event.cardName).toBe("Fire Dragon");
    expect(event.cardType).toBe("Unit");
    expect(event.cardSuperTypes).toEqual(["Dragon"]);
  });

  it("uses custom limit when provided", async () => {
    mockCollectionEventsRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/collection-events?limit=25");
    expect(mockCollectionEventsRepo.listForUser).toHaveBeenCalledWith(USER_ID, 25, undefined);
  });

  it("returns nextCursor as ISO string from the last item createdAt", async () => {
    const lastDate = new Date("2026-03-16T12:00:00Z");
    const items = Array.from({ length: 11 }, (_, idx) => ({
      ...dbEvent,
      id: `a0000000-0001-4000-a000-${String(idx).padStart(12, "0")}`,
      createdAt: new Date(lastDate.getTime() - idx * 1000),
    }));
    mockCollectionEventsRepo.listForUser.mockResolvedValue(items);
    const res = await app.request("/api/v1/collection-events?limit=10");
    const json = await res.json();
    expect(json.items).toHaveLength(10);
    // The last item in the sliced array (index 9) has createdAt = lastDate - 9s
    expect(json.nextCursor).toBe(new Date(lastDate.getTime() - 9000).toISOString());
  });
});
