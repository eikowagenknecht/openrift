import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { preferencesRouter } from "./preferences";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  getByUserId: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  upsert: vi.fn(() => Promise.resolve({})),
};

// ---------------------------------------------------------------------------
// Test app — mounts the router the way production does (catch-all). A pre-set
// `user` satisfies the fail-closed `requireUser` gate (resolveSession is
// idempotent). The local onError is a belt-and-suspenders for the unexercised
// 401 path; AppErrors are mapped to the envelope by the handler's interceptor.
// ---------------------------------------------------------------------------

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

  // Regression: languages + completionScope used to be dropped by the response
  // projection, silently breaking the web's cross-device preference sync.
  it("returns languages and completionScope when stored", async () => {
    const storedPrefs = {
      languages: ["en", "de"],
      completionScope: { sets: ["set-a"], promos: "exclude", signed: true },
    };
    mockRepo.getByUserId.mockResolvedValue({ userId: USER_ID, data: storedPrefs });
    const res = await app.request("/api/v1/preferences");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.languages).toEqual(["en", "de"]);
    expect(json.completionScope).toEqual({ sets: ["set-a"], promos: "exclude", signed: true });
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

  it("updates defaultCardView preference", async () => {
    mockRepo.upsert.mockResolvedValue({ defaultCardView: "cards" });
    const res = await app.request("/api/v1/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultCardView: "cards" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
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

  // Regression: completionScope was absent from updatePreferencesSchema, so the
  // web's PATCH of it was silently stripped (z.object drops unknown keys) and
  // never persisted. languages was accepted but never read back.
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
    const json = await res.json();
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

// Regression guard (#44 / a3360460): a preference accepted on PATCH but missing
// from the read DTO round-trips on write yet is silently dropped on read — the
// response schema is not runtime-validated and every read field is optional, so
// neither zod nor tsc flags the gap. That is exactly how `languages` regressed
// and broke cross-device sync. The example-based tests above only cover the
// fields they name; this invariant catches a NEW write field added without
// wiring the read side, for any field, automatically.
describe("preferences read/write schema parity", () => {
  it("declares every PATCH (write) field in the GET response (read) schema", async () => {
    // Imported dynamically: response-schemas calls `.openapi()` at module load,
    // which only exists after @hono/zod-openapi (pulled in by the statically
    // imported route above) has extended Zod. A static top-level import here
    // would evaluate response-schemas before that extension runs and throw.
    const { updatePreferencesSchema } = await import("@openrift/shared/schemas");
    const { userPreferencesResponseSchema } = await import("@openrift/shared/response-schemas");

    const writeKeys = Object.keys(updatePreferencesSchema.shape);
    const readKeys = new Set(Object.keys(userPreferencesResponseSchema.shape));

    const missingFromRead = writeKeys.filter((key) => !readKeys.has(key));

    // Every settable preference must be readable back, or it silently fails to
    // sync. (Read-only fields in the response schema are allowed — the check is
    // one-directional: write ⊆ read.)
    expect(missingFromRead).toEqual([]);
  });
});
