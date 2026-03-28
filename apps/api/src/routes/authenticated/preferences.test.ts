import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { PREFERENCES_DEFAULTS } from "../../repositories/user-preferences.js";
import { preferencesRoute } from "./preferences";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  getByUserId: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  upsert: vi.fn(() => Promise.resolve(PREFERENCES_DEFAULTS)),
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

  it("returns defaults when no preferences exist", async () => {
    mockRepo.getByUserId.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(PREFERENCES_DEFAULTS);
    expect(mockRepo.getByUserId).toHaveBeenCalledWith(USER_ID);
  });

  it("returns stored preferences when they exist", async () => {
    const storedPrefs = {
      ...PREFERENCES_DEFAULTS,
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

  it("returns defaults when row exists but data is null", async () => {
    mockRepo.getByUserId.mockResolvedValue({ userId: USER_ID, data: null });
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(PREFERENCES_DEFAULTS);
  });
});

describe("PATCH /api/v1/preferences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with updated preferences", async () => {
    const updated = { ...PREFERENCES_DEFAULTS, showImages: false };
    mockRepo.upsert.mockResolvedValue(updated);
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
    const updated = { ...PREFERENCES_DEFAULTS, theme: "dark" };
    mockRepo.upsert.mockResolvedValue(updated);
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
    const updated = {
      ...PREFERENCES_DEFAULTS,
      visibleFields: { ...PREFERENCES_DEFAULTS.visibleFields, price: false },
    };
    mockRepo.upsert.mockResolvedValue(updated);
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibleFields: { price: false } }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.visibleFields.price).toBe(false);
  });

  it("updates richEffects preference", async () => {
    const updated = { ...PREFERENCES_DEFAULTS, richEffects: false };
    mockRepo.upsert.mockResolvedValue(updated);
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ richEffects: false }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.richEffects).toBe(false);
  });

  it("updates marketplaceOrder preference", async () => {
    const updated = {
      ...PREFERENCES_DEFAULTS,
      marketplaceOrder: ["cardmarket", "tcgplayer"],
    };
    mockRepo.upsert.mockResolvedValue(updated);
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
    mockRepo.upsert.mockResolvedValue(PREFERENCES_DEFAULTS);
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });
});
