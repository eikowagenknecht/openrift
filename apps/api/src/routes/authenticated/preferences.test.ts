import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { preferencesRoute } from "./preferences";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  getByUserId: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  upsert: vi.fn(() => Promise.resolve({})),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { userPreferences: mockRepo } as never);
    await next();
  })
  .route("/api/v1", preferencesRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/preferences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty object when no preferences exist", async () => {
    mockRepo.getByUserId.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({});
    expect(mockRepo.getByUserId).toHaveBeenCalledWith(USER_ID);
  });

  it("returns stored preferences when they exist", async () => {
    const storedPrefs = {
      ...PREFERENCE_DEFAULTS,
      showImages: false,
      theme: "dark",
    };
    mockRepo.getByUserId.mockResolvedValue({ userId: USER_ID, data: storedPrefs });
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.showImages).toBe(false);
    expect(json.theme).toBe("dark");
  });

  it("returns empty object when row exists but data is null", async () => {
    mockRepo.getByUserId.mockResolvedValue({ userId: USER_ID, data: null });
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({});
  });
});

describe("PATCH /api/v1/preferences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with updated preferences", async () => {
    mockRepo.upsert.mockResolvedValue({ showImages: false });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showImages: false }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.showImages).toBe(false);
    expect(mockRepo.upsert).toHaveBeenCalledWith(USER_ID, { showImages: false });
  });

  it("updates theme preference", async () => {
    mockRepo.upsert.mockResolvedValue({ theme: "dark" });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "dark" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.theme).toBe("dark");
  });

  it("updates visibleFields partial object", async () => {
    mockRepo.upsert.mockResolvedValue({ visibleFields: { price: false } });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibleFields: { price: false } }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.visibleFields.price).toBe(false);
  });

  it("updates fancyFan preference", async () => {
    mockRepo.upsert.mockResolvedValue({ fancyFan: false });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fancyFan: false }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fancyFan).toBe(false);
  });

  it("updates marketplaceOrder preference", async () => {
    mockRepo.upsert.mockResolvedValue({ marketplaceOrder: ["cardmarket", "tcgplayer"] });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplaceOrder: ["cardmarket", "tcgplayer"] }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.marketplaceOrder).toEqual(["cardmarket", "tcgplayer"]);
  });

  it("rejects invalid theme value", async () => {
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "neon" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate marketplaces", async () => {
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplaceOrder: ["tcgplayer", "tcgplayer"] }),
    });
    expect(res.status).toBe(400);
  });

  it("allows empty body (all fields optional)", async () => {
    mockRepo.upsert.mockResolvedValue({});
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });
});
