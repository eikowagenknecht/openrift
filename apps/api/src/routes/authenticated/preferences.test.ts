import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { preferencesRouter } from "./preferences";

const mockRepo = {
  getByUserId: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  upsert: vi.fn(() => Promise.resolve({})),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  // oxlint-disable-next-line no-explicit-any -- test stub doesn't match full types
  c.set("user", { id: USER_ID } as any);
  // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  c.set("repos", { userPreferences: mockRepo } as any);
  await next();
});
registerRouterForTest(app, preferencesRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

describe("GET /api/v1/preferences", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty object when no preferences exist", async () => {
    mockRepo.getByUserId.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await readJson(res);
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
    const json = await readJson(res);
    expect(json.showImages).toBe(false);
    expect(json.theme).toBe("dark");
  });

  it("returns empty object when row exists but data is null", async () => {
    mockRepo.getByUserId.mockResolvedValue({ userId: USER_ID, data: null });
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({});
  });

  it("returns languages and completionScope when stored", async () => {
    const storedPrefs = {
      languages: ["en", "de"],
      completionScope: { sets: ["set-a"], promos: "exclude", signed: true },
    };
    mockRepo.getByUserId.mockResolvedValue({ userId: USER_ID, data: storedPrefs });
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.languages).toEqual(["en", "de"]);
    expect(json.completionScope).toEqual({ sets: ["set-a"], promos: "exclude", signed: true });
  });

  it("drops a stored value the response schema rejects and keeps the rest", async () => {
    mockRepo.getByUserId.mockResolvedValue({
      userId: USER_ID,
      data: { theme: "solarized", showImages: false, defaultCurrency: "GBP" },
    });
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ showImages: false });
  });

  it("drops a nested value the response schema rejects", async () => {
    mockRepo.getByUserId.mockResolvedValue({
      userId: USER_ID,
      data: { completionScope: { promos: "sometimes" }, languages: ["en"] },
    });
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ languages: ["en"] });
  });

  it("does not leak undocumented stored keys", async () => {
    mockRepo.getByUserId.mockResolvedValue({
      userId: USER_ID,
      data: { showImages: true, hiddenFilterSections: ["sets"] },
    });
    const res = await app.request("/api/v1/preferences");
    expect(await readJson(res)).toEqual({ showImages: true });
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
    const json = await readJson(res);
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
    const json = await readJson(res);
    expect(json.theme).toBe("dark");
  });

  it("updates fancyFan preference", async () => {
    mockRepo.upsert.mockResolvedValue({ fancyFan: false });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fancyFan: false }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
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
    const json = await readJson(res);
    expect(json.marketplaceOrder).toEqual(["cardmarket", "tcgplayer"]);
  });

  it("updates defaultCardView preference", async () => {
    mockRepo.upsert.mockResolvedValue({ defaultCardView: "cards" });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultCardView: "cards" }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.defaultCardView).toBe("cards");
  });

  it("rejects invalid defaultCardView value", async () => {
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultCardView: "copies" }),
    });
    expect(res.status).toBe(400);
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

  it("persists languages and completionScope instead of stripping them", async () => {
    const completionScope = {
      sets: ["set-a"],
      languages: ["en"],
      promos: "only",
      banned: false,
    };
    mockRepo.upsert.mockResolvedValue({ languages: ["en"], completionScope });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ languages: ["en"], completionScope }),
    });
    expect(res.status).toBe(200);
    expect(mockRepo.upsert).toHaveBeenCalledWith(USER_ID, { languages: ["en"], completionScope });
    const json = await readJson(res);
    expect(json.completionScope).toEqual(completionScope);
  });

  it("rejects an invalid completionScope.promos value", async () => {
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completionScope: { promos: "sometimes" } }),
    });
    expect(res.status).toBe(400);
  });
});

describe("preferences read/write schema parity", () => {
  it("declares every PATCH (write) field in the GET response (read) schema", async () => {
    // Dynamic import: the contract's .openapi() call needs @hono/zod-openapi's Zod
    // extension, which only runs after the statically imported route above loads it.
    const { updatePreferencesSchema, userPreferencesResponseSchema } =
      await import("@openrift/shared/contracts/preferences");

    // Retired preferences stay writable so clients can still send `null` to clear them.
    const retiredWriteOnlyKeys = new Set(["hiddenFilterSections", "compactFilterView"]);

    const writeKeys = Object.keys(updatePreferencesSchema.shape).filter(
      (key) => !retiredWriteOnlyKeys.has(key),
    );
    const readKeys = new Set(Object.keys(userPreferencesResponseSchema.shape));

    const missingFromRead = writeKeys.filter((key) => !readKeys.has(key));

    expect(missingFromRead).toEqual([]);
  });
});
