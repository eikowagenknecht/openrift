import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { wishListsRoute } from "./wish-lists";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  create: vi.fn(() => Promise.resolve({} as object)),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteByIdForUser: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
  items: vi.fn(() => Promise.resolve([] as object[])),
  exists: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  createItem: vi.fn(() => Promise.resolve({} as object)),
  updateItem: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteItem: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { wishLists: mockRepo } as never);
    await next();
  })
  .route("/api/v1", wishListsRoute)
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

const WISH_LIST_ID = "a0000000-0001-4000-a000-000000000010";
const ITEM_ID = "a0000000-0001-4000-a000-000000000020";

const dbWishList = {
  id: WISH_LIST_ID,
  userId: USER_ID,
  name: "Want List",
  rules: null,
  createdAt: now,
  updatedAt: now,
};

const dbWishListItem = {
  id: ITEM_ID,
  wishListId: WISH_LIST_ID,
  userId: USER_ID,
  cardId: "c0000000-0001-4000-a000-000000000001",
  printingId: null,
  quantityDesired: 2,
  createdAt: now,
  updatedAt: now,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/wish-lists", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("returns 200 with list of wish lists", async () => {
    mockRepo.listForUser.mockResolvedValue([dbWishList]);
    const res = await app.request("/api/v1/wish-lists");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].name).toBe("Want List");
  });
});

describe("POST /api/v1/wish-lists", () => {
  beforeEach(() => {
    mockRepo.create.mockReset();
  });

  it("returns 201 with created wish list", async () => {
    mockRepo.create.mockResolvedValue(dbWishList);
    const res = await app.request("/api/v1/wish-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Want List" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Want List");
  });

  it("creates with rules", async () => {
    const withRules = { ...dbWishList, rules: '{"priority":"high"}' };
    mockRepo.create.mockResolvedValue(withRules);
    const res = await app.request("/api/v1/wish-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Want List", rules: { priority: "high" } }),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/wish-lists/:id", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
    mockRepo.items.mockReset();
  });

  it("returns 200 with wish list and items", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbWishList);
    mockRepo.items.mockResolvedValue([dbWishListItem]);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.wishList.name).toBe("Want List");
    expect(json.items).toHaveLength(1);
    expect(json.items[0].quantityDesired).toBe(2);
  });

  it("returns 404 when not found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/wish-lists/:id", () => {
  beforeEach(() => {
    mockRepo.update.mockReset();
  });

  it("returns 200 with updated wish list", async () => {
    const updated = { ...dbWishList, name: "Updated" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Updated");
  });

  it("returns 404 when not found", async () => {
    mockRepo.update.mockResolvedValue();
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/wish-lists/:id", () => {
  beforeEach(() => {
    mockRepo.deleteByIdForUser.mockReset();
  });

  it("returns 204 when deleted", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 404 when not found", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/wish-lists/:id/items", () => {
  beforeEach(() => {
    mockRepo.exists.mockReset();
    mockRepo.createItem.mockReset();
  });

  it("returns 201 with created item (cardId)", async () => {
    mockRepo.exists.mockResolvedValue({ id: WISH_LIST_ID });
    mockRepo.createItem.mockResolvedValue(dbWishListItem);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c0000000-0001-4000-a000-000000000001", quantityDesired: 2 }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 201 with created item (printingId)", async () => {
    const printingItem = {
      ...dbWishListItem,
      cardId: null,
      printingId: "d0000000-0002-4000-a000-000000000001",
    };
    mockRepo.exists.mockResolvedValue({ id: WISH_LIST_ID });
    mockRepo.createItem.mockResolvedValue(printingItem);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printingId: "d0000000-0002-4000-a000-000000000001",
        quantityDesired: 1,
      }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 400 when both cardId and printingId provided", async () => {
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: "c0000000-0001-4000-a000-000000000001",
        printingId: "d0000000-0002-4000-a000-000000000001",
      }),
    });
    // Zod refine rejects both — returned as 400 by zValidator
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither cardId nor printingId provided", async () => {
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantityDesired: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when wish list not found", async () => {
    mockRepo.exists.mockResolvedValue();
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c0000000-0001-4000-a000-000000000001" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/wish-lists/:id/items/:itemId", () => {
  beforeEach(() => {
    mockRepo.updateItem.mockReset();
  });

  it("returns 200 with updated item", async () => {
    const updated = { ...dbWishListItem, quantityDesired: 5 };
    mockRepo.updateItem.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items/${ITEM_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantityDesired: 5 }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.quantityDesired).toBe(5);
  });

  it("returns 404 when item not found", async () => {
    mockRepo.updateItem.mockResolvedValue();
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items/${ITEM_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantityDesired: 5 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/wish-lists/:id/items/:itemId", () => {
  beforeEach(() => {
    mockRepo.deleteItem.mockReset();
  });

  it("returns 204 when item deleted", async () => {
    mockRepo.deleteItem.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items/${ITEM_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("returns 404 when item not found", async () => {
    mockRepo.deleteItem.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items/${ITEM_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/wish-lists — rules serialization", () => {
  beforeEach(() => {
    mockRepo.create.mockReset();
  });

  it("passes null rules when no rules provided", async () => {
    mockRepo.create.mockResolvedValue(dbWishList);
    await app.request("/api/v1/wish-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Rules" }),
    });
    expect(mockRepo.create).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "No Rules",
      rules: null,
    });
  });

  it("serializes rules as JSON string", async () => {
    mockRepo.create.mockResolvedValue({ ...dbWishList, rules: '{"priority":"high"}' });
    await app.request("/api/v1/wish-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "With Rules", rules: { priority: "high" } }),
    });
    expect(mockRepo.create).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "With Rules",
      rules: '{"priority":"high"}',
    });
  });
});

describe("PATCH /api/v1/wish-lists/:id — rules update", () => {
  beforeEach(() => {
    mockRepo.update.mockReset();
  });

  it("serializes rules via patchFields transform", async () => {
    const updated = { ...dbWishList, rules: '{"minRarity":"rare"}' };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: { minRarity: "rare" } }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(WISH_LIST_ID, USER_ID, {
      rules: '{"minRarity":"rare"}',
    });
  });

  it("updates name field", async () => {
    const updated = { ...dbWishList, name: "New Name" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(WISH_LIST_ID, USER_ID, { name: "New Name" });
  });
});

describe("POST /api/v1/wish-lists/:id/items — argument passing", () => {
  beforeEach(() => {
    mockRepo.exists.mockReset();
    mockRepo.createItem.mockReset();
  });

  it("passes correct arguments with cardId", async () => {
    mockRepo.exists.mockResolvedValue({ id: WISH_LIST_ID });
    mockRepo.createItem.mockResolvedValue(dbWishListItem);
    await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c0000000-0001-4000-a000-000000000001", quantityDesired: 3 }),
    });
    expect(mockRepo.createItem).toHaveBeenCalledWith({
      wishListId: WISH_LIST_ID,
      userId: USER_ID,
      cardId: "c0000000-0001-4000-a000-000000000001",
      printingId: null,
      quantityDesired: 3,
    });
  });

  it("passes correct arguments with printingId", async () => {
    mockRepo.exists.mockResolvedValue({ id: WISH_LIST_ID });
    mockRepo.createItem.mockResolvedValue({
      ...dbWishListItem,
      cardId: null,
      printingId: "d0000000-0001-4000-a000-000000000001",
    });
    await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printingId: "d0000000-0001-4000-a000-000000000001",
        quantityDesired: 1,
      }),
    });
    expect(mockRepo.createItem).toHaveBeenCalledWith({
      wishListId: WISH_LIST_ID,
      userId: USER_ID,
      cardId: null,
      printingId: "d0000000-0001-4000-a000-000000000001",
      quantityDesired: 1,
    });
  });

  it("defaults quantityDesired to 1 when not provided", async () => {
    mockRepo.exists.mockResolvedValue({ id: WISH_LIST_ID });
    mockRepo.createItem.mockResolvedValue(dbWishListItem);
    await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c0000000-0001-4000-a000-000000000001" }),
    });
    expect(mockRepo.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ quantityDesired: 1 }),
    );
  });
});

describe("GET /api/v1/wish-lists/:id — detail response fields", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
    mockRepo.items.mockReset();
  });

  it("maps all wish list fields correctly", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbWishList);
    mockRepo.items.mockResolvedValue([dbWishListItem]);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`);
    const json = await res.json();
    expect(json.wishList.id).toBe(WISH_LIST_ID);
    expect(json.wishList.rules).toBeNull();
    expect(json.wishList.createdAt).toBe(now.toISOString());
    expect(json.wishList.updatedAt).toBe(now.toISOString());
    expect(json.items[0].id).toBe(ITEM_ID);
    expect(json.items[0].wishListId).toBe(WISH_LIST_ID);
    expect(json.items[0].cardId).toBe("c0000000-0001-4000-a000-000000000001");
    expect(json.items[0].printingId).toBeNull();
  });

  it("returns empty items when wish list has no items", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbWishList);
    mockRepo.items.mockResolvedValue([]);
    const res = await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}`);
    const json = await res.json();
    expect(json.items).toEqual([]);
  });
});

describe("PATCH /api/v1/wish-lists/:id/items/:itemId — argument passing", () => {
  beforeEach(() => {
    mockRepo.updateItem.mockReset();
  });

  it("passes correct arguments to updateItem", async () => {
    const updated = { ...dbWishListItem, quantityDesired: 10 };
    mockRepo.updateItem.mockResolvedValue(updated);
    await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items/${ITEM_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantityDesired: 10 }),
    });
    expect(mockRepo.updateItem).toHaveBeenCalledWith(ITEM_ID, WISH_LIST_ID, USER_ID, {
      quantityDesired: 10,
    });
  });
});

describe("DELETE /api/v1/wish-lists/:id/items/:itemId — argument passing", () => {
  beforeEach(() => {
    mockRepo.deleteItem.mockReset();
  });

  it("passes correct arguments to deleteItem", async () => {
    mockRepo.deleteItem.mockResolvedValue({ numDeletedRows: 1n });
    await app.request(`/api/v1/wish-lists/${WISH_LIST_ID}/items/${ITEM_ID}`, {
      method: "DELETE",
    });
    expect(mockRepo.deleteItem).toHaveBeenCalledWith(ITEM_ID, WISH_LIST_ID, USER_ID);
  });
});
