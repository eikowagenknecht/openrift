import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { shoppingListRoute } from "./shopping-list";

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

const mockBuildShoppingList = vi.fn(() => Promise.resolve([] as object[]));

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const mockRepos = {} as never;

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", mockRepos);
    c.set("services", {
      buildShoppingList: mockBuildShoppingList,
    } as never);
    await next();
  })
  .route("/api/v1", shoppingListRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/shopping-list", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with empty items when nothing needed", async () => {
    mockBuildShoppingList.mockResolvedValue([]);
    const res = await app.request("/api/v1/shopping-list");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([]);
  });

  it("returns 200 with shopping list items", async () => {
    const items = [
      { cardId: "OGS-001", cardName: "Fire Dragon", needed: 4, owned: 1, shortfall: 3 },
      { cardId: "OGS-002", cardName: "Ice Golem", needed: 2, owned: 0, shortfall: 2 },
    ];
    mockBuildShoppingList.mockResolvedValue(items);
    const res = await app.request("/api/v1/shopping-list");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(2);
    expect(json.items[0].cardId).toBe("OGS-001");
    expect(json.items[1].shortfall).toBe(2);
  });

  it("passes repos and userId to the service", async () => {
    mockBuildShoppingList.mockResolvedValue([]);
    await app.request("/api/v1/shopping-list");
    expect(mockBuildShoppingList).toHaveBeenCalledWith(mockRepos, USER_ID);
  });

  it("propagates service errors", async () => {
    mockBuildShoppingList.mockRejectedValue(new AppError(500, "INTERNAL_ERROR", "DB error"));
    const res = await app.request("/api/v1/shopping-list");
    expect(res.status).toBe(500);
  });
});
