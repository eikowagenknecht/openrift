import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { activitiesRoute } from "./activities";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  itemsWithDetails: vi.fn(() => Promise.resolve([] as object[])),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { activities: mockRepo } as never);
    await next();
  })
  .route("/api/v1", activitiesRoute)
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

const dbActivity = {
  id: "a0000000-0001-4000-a000-000000000020",
  userId: USER_ID,
  type: "acquisition",
  name: "Added 3 cards",
  date: now,
  description: null,
  isAuto: true,
  createdAt: now,
  updatedAt: now,
};

const dbActivityItem = {
  id: "a0000000-0001-4000-a000-000000000030",
  activityId: dbActivity.id,
  activityType: "acquisition",
  copyId: "a0000000-0001-4000-a000-000000000040",
  printingId: "OGS-001:rare:normal:",
  action: "added",
  fromCollectionId: null,
  fromCollectionName: null,
  toCollectionId: "a0000000-0001-4000-a000-000000000050",
  toCollectionName: "Inbox",
  metadataSnapshot: null,
  createdAt: now,
  setId: "OGS",
  collectorNumber: 1,
  rarity: "Rare",
  imageUrl: "https://example.com/img.jpg",
  cardName: "Fire Dragon",
  cardType: "Unit",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/activities", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("returns 200 with paginated activities", async () => {
    mockRepo.listForUser.mockResolvedValue([dbActivity]);
    const res = await app.request("/api/v1/activities");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].type).toBe("acquisition");
    expect(json.nextCursor).toBeNull();
  });

  it("returns nextCursor when hasMore", async () => {
    // Default limit is 50, so return 51 items to trigger hasMore
    const items = Array.from({ length: 51 }, (_, i) => ({
      ...dbActivity,
      id: `a0000000-0001-4000-a000-${String(i).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - i * 60_000),
    }));
    mockRepo.listForUser.mockResolvedValue(items);
    const res = await app.request("/api/v1/activities");
    const json = await res.json();
    expect(json.items).toHaveLength(50);
    expect(json.nextCursor).toBeTruthy();
  });
});

describe("GET /api/v1/activities/:id", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
    mockRepo.itemsWithDetails.mockReset();
  });

  it("returns 200 with activity and items", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbActivity);
    mockRepo.itemsWithDetails.mockResolvedValue([dbActivityItem]);
    const res = await app.request(`/api/v1/activities/${dbActivity.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activity.id).toBe(dbActivity.id);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].createdAt).toBe(now.toISOString());
  });

  it("returns 404 when activity not found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/v1/activities/${dbActivity.id}`);
    expect(res.status).toBe(404);
  });

  it("returns activity with multiple items", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbActivity);
    const secondItem = {
      ...dbActivityItem,
      id: "a0000000-0001-4000-a000-000000000031",
      action: "moved",
      fromCollectionId: "a0000000-0001-4000-a000-000000000060",
      fromCollectionName: "Binder A",
    };
    mockRepo.itemsWithDetails.mockResolvedValue([dbActivityItem, secondItem]);
    const res = await app.request(`/api/v1/activities/${dbActivity.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(2);
    expect(json.items[0].action).toBe("added");
    expect(json.items[1].action).toBe("moved");
    expect(json.items[1].fromCollectionName).toBe("Binder A");
  });

  it("returns empty items array when activity has no items", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbActivity);
    mockRepo.itemsWithDetails.mockResolvedValue([]);
    const res = await app.request(`/api/v1/activities/${dbActivity.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([]);
  });
});

describe("GET /api/v1/activities — query parameters", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("passes cursor and limit to repo", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/activities?limit=25&cursor=2026-03-17T00:00:00.000Z");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, 25, "2026-03-17T00:00:00.000Z");
  });

  it("defaults limit to 50 when not provided", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/activities");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, 50, undefined);
  });

  it("returns empty items when no activities exist", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/activities");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([]);
    expect(json.nextCursor).toBeNull();
  });

  it("returns null nextCursor when items exactly equal limit", async () => {
    const items = Array.from({ length: 50 }, (_, idx) => ({
      ...dbActivity,
      id: `a0000000-0001-4000-a000-${String(idx).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - idx * 60_000),
    }));
    mockRepo.listForUser.mockResolvedValue(items);
    const res = await app.request("/api/v1/activities");
    const json = await res.json();
    expect(json.items).toHaveLength(50);
    expect(json.nextCursor).toBeNull();
  });

  it("maps all activity fields correctly", async () => {
    mockRepo.listForUser.mockResolvedValue([dbActivity]);
    const res = await app.request("/api/v1/activities");
    const json = await res.json();
    const item = json.items[0];
    expect(item.id).toBe(dbActivity.id);
    expect(item.type).toBe("acquisition");
    expect(item.name).toBe("Added 3 cards");
    expect(item.description).toBeNull();
    expect(item.isAuto).toBe(true);
    expect(item.createdAt).toBe(now.toISOString());
    expect(item.updatedAt).toBe(now.toISOString());
  });
});
