import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { tradeListsRoute } from "./trade-lists";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  create: vi.fn(() => Promise.resolve({} as object)),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteByIdForUser: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
  itemsWithDetails: vi.fn(() => Promise.resolve([] as object[])),
  exists: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  createItem: vi.fn(() => Promise.resolve({} as object)),
  deleteItem: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
};

const mockCopiesRepo = {
  existsForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", {
      tradeLists: mockRepo,
      copies: mockCopiesRepo,
    } as never);
    await next();
  })
  .route("/api/v1", tradeListsRoute)
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

const TRADE_LIST_ID = "a0000000-0001-4000-a000-000000000010";
const ITEM_ID = "a0000000-0001-4000-a000-000000000020";
const COPY_ID = "a0000000-0001-4000-a000-000000000030";

const dbTradeList = {
  id: TRADE_LIST_ID,
  userId: USER_ID,
  name: "For Trade",
  rules: null,
  createdAt: now,
  updatedAt: now,
};

const dbTradeListItem = {
  id: ITEM_ID,
  tradeListId: TRADE_LIST_ID,
  copyId: COPY_ID,
  printingId: "OGS-001:rare:normal:",
  collectionId: "a0000000-0001-4000-a000-000000000040",
  imageUrl: "https://example.com/img.jpg",
  setId: "OGS",
  rarity: "Rare",
  finish: "normal",
  cardName: "Fire Dragon",
  cardType: "Unit",
  createdAt: now,
  updatedAt: now,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/trade-lists", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("returns 200 with list of trade lists", async () => {
    mockRepo.listForUser.mockResolvedValue([dbTradeList]);
    const res = await app.request("/api/v1/trade-lists");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].name).toBe("For Trade");
  });
});

describe("POST /api/v1/trade-lists", () => {
  beforeEach(() => {
    mockRepo.create.mockReset();
  });

  it("returns 201 with created trade list", async () => {
    mockRepo.create.mockResolvedValue(dbTradeList);
    const res = await app.request("/api/v1/trade-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "For Trade" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("For Trade");
  });

  it("creates with rules", async () => {
    const withRules = { ...dbTradeList, rules: '{"minValue":5}' };
    mockRepo.create.mockResolvedValue(withRules);
    const res = await app.request("/api/v1/trade-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "For Trade", rules: { minValue: 5 } }),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/trade-lists/:id", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
    mockRepo.itemsWithDetails.mockReset();
  });

  it("returns 200 with trade list and items", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbTradeList);
    mockRepo.itemsWithDetails.mockResolvedValue([dbTradeListItem]);
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tradeList.name).toBe("For Trade");
    expect(json.items).toHaveLength(1);
    expect(json.items[0].cardName).toBe("Fire Dragon");
    expect(json.items[0].printingId).toBe("OGS-001:rare:normal:");
  });

  it("returns 404 when not found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/trade-lists/:id", () => {
  beforeEach(() => {
    mockRepo.update.mockReset();
  });

  it("returns 200 with updated trade list", async () => {
    const updated = { ...dbTradeList, name: "Updated" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`, {
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
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/trade-lists/:id", () => {
  beforeEach(() => {
    mockRepo.deleteByIdForUser.mockReset();
  });

  it("returns 204 when deleted", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 404 when not found", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/trade-lists/:id/items", () => {
  beforeEach(() => {
    mockRepo.exists.mockReset();
    mockCopiesRepo.existsForUser.mockReset();
    mockRepo.createItem.mockReset();
  });

  it("returns 201 with created item", async () => {
    mockRepo.exists.mockResolvedValue({ id: TRADE_LIST_ID });
    mockCopiesRepo.existsForUser.mockResolvedValue({ id: COPY_ID });
    mockRepo.createItem.mockResolvedValue({
      id: ITEM_ID,
      tradeListId: TRADE_LIST_ID,
      copyId: COPY_ID,
      userId: USER_ID,
      createdAt: now,
      updatedAt: now,
    });
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyId: COPY_ID }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 404 when trade list not found", async () => {
    mockRepo.exists.mockResolvedValue();
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyId: COPY_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when copy not found", async () => {
    mockRepo.exists.mockResolvedValue({ id: TRADE_LIST_ID });
    mockCopiesRepo.existsForUser.mockResolvedValue();
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyId: COPY_ID }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/trade-lists/:id/items/:itemId", () => {
  beforeEach(() => {
    mockRepo.deleteItem.mockReset();
  });

  it("returns 204 when item deleted", async () => {
    mockRepo.deleteItem.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}/items/${ITEM_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("returns 404 when item not found", async () => {
    mockRepo.deleteItem.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}/items/${ITEM_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/trade-lists — rules serialization", () => {
  beforeEach(() => {
    mockRepo.create.mockReset();
  });

  it("passes null rules when no rules provided", async () => {
    mockRepo.create.mockResolvedValue(dbTradeList);
    await app.request("/api/v1/trade-lists", {
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
    mockRepo.create.mockResolvedValue({ ...dbTradeList, rules: '{"minValue":5}' });
    await app.request("/api/v1/trade-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "With Rules", rules: { minValue: 5 } }),
    });
    expect(mockRepo.create).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "With Rules",
      rules: '{"minValue":5}',
    });
  });
});

describe("PATCH /api/v1/trade-lists/:id — rules update", () => {
  beforeEach(() => {
    mockRepo.update.mockReset();
  });

  it("serializes rules via patchFields transform", async () => {
    const updated = { ...dbTradeList, rules: '{"maxCards":10}' };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: { maxCards: 10 } }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(TRADE_LIST_ID, USER_ID, {
      rules: '{"maxCards":10}',
    });
  });

  it("passes null rules when rules is null", async () => {
    const updated = { ...dbTradeList, rules: null };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: null }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(TRADE_LIST_ID, USER_ID, { rules: null });
  });

  it("updates name field", async () => {
    const updated = { ...dbTradeList, name: "Renamed" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.update).toHaveBeenCalledWith(TRADE_LIST_ID, USER_ID, { name: "Renamed" });
  });
});

describe("GET /api/v1/trade-lists/:id — detail response fields", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
    mockRepo.itemsWithDetails.mockReset();
  });

  it("maps all trade list fields correctly", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbTradeList);
    mockRepo.itemsWithDetails.mockResolvedValue([dbTradeListItem]);
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`);
    const json = await res.json();
    expect(json.tradeList.id).toBe(TRADE_LIST_ID);
    expect(json.tradeList.rules).toBeNull();
    expect(json.tradeList.createdAt).toBe(now.toISOString());
    expect(json.tradeList.updatedAt).toBe(now.toISOString());
    expect(json.items[0].id).toBe(ITEM_ID);
    expect(json.items[0].tradeListId).toBe(TRADE_LIST_ID);
    expect(json.items[0].copyId).toBe(COPY_ID);
    expect(json.items[0].collectionId).toBe("a0000000-0001-4000-a000-000000000040");
    expect(json.items[0].setId).toBe("OGS");
    expect(json.items[0].rarity).toBe("Rare");
    expect(json.items[0].finish).toBe("normal");
  });

  it("returns empty items when trade list has no items", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbTradeList);
    mockRepo.itemsWithDetails.mockResolvedValue([]);
    const res = await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}`);
    const json = await res.json();
    expect(json.items).toEqual([]);
  });
});

describe("POST /api/v1/trade-lists/:id/items — argument passing", () => {
  beforeEach(() => {
    mockRepo.exists.mockReset();
    mockCopiesRepo.existsForUser.mockReset();
    mockRepo.createItem.mockReset();
  });

  it("passes correct arguments to createItem", async () => {
    mockRepo.exists.mockResolvedValue({ id: TRADE_LIST_ID });
    mockCopiesRepo.existsForUser.mockResolvedValue({ id: COPY_ID });
    mockRepo.createItem.mockResolvedValue({
      id: ITEM_ID,
      tradeListId: TRADE_LIST_ID,
      copyId: COPY_ID,
      userId: USER_ID,
      createdAt: now,
      updatedAt: now,
    });
    await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyId: COPY_ID }),
    });
    expect(mockRepo.createItem).toHaveBeenCalledWith({
      tradeListId: TRADE_LIST_ID,
      userId: USER_ID,
      copyId: COPY_ID,
    });
  });
});

describe("DELETE /api/v1/trade-lists/:id/items/:itemId — argument passing", () => {
  beforeEach(() => {
    mockRepo.deleteItem.mockReset();
  });

  it("passes correct arguments to deleteItem", async () => {
    mockRepo.deleteItem.mockResolvedValue({ numDeletedRows: 1n });
    await app.request(`/api/v1/trade-lists/${TRADE_LIST_ID}/items/${ITEM_ID}`, {
      method: "DELETE",
    });
    expect(mockRepo.deleteItem).toHaveBeenCalledWith(ITEM_ID, TRADE_LIST_ID, USER_ID);
  });
});

describe("GET /api/v1/trade-lists — empty list", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("returns empty items array when no trade lists exist", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/trade-lists");
    const json = await res.json();
    expect(json.items).toEqual([]);
  });
});
