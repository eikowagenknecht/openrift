import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { userShareRouter } from "./user-share";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockUserSharesRepo = {
  getShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  setShareToken: vi.fn((_userId: string, _token: string | null) =>
    Promise.resolve(undefined as object | undefined),
  ),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { userShares: mockUserSharesRepo } as never);
  await next();
});
registerRouterForTest(app, userShareRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => vi.resetAllMocks());

describe("GET /api/v1/users/me/share", () => {
  it("returns the existing token with isPublic=true", async () => {
    mockUserSharesRepo.getShareToken.mockResolvedValue({ shareToken: "tok123456789" });
    const res = await app.request("/api/v1/users/me/share");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toBe("tok123456789");
    expect(json.isPublic).toBe(true);
    expect(mockUserSharesRepo.getShareToken).toHaveBeenCalledWith(USER_ID);
  });

  it("returns null token with isPublic=false when not shared", async () => {
    mockUserSharesRepo.getShareToken.mockResolvedValue({ shareToken: null });
    const res = await app.request("/api/v1/users/me/share");
    const json = await readJson(res);
    expect(json.shareToken).toBeNull();
    expect(json.isPublic).toBe(false);
  });

  it("treats a missing row as not shared", async () => {
    mockUserSharesRepo.getShareToken.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/users/me/share");
    const json = await readJson(res);
    expect(json.shareToken).toBeNull();
    expect(json.isPublic).toBe(false);
  });
});

describe("POST /api/v1/users/me/share (enable)", () => {
  it("returns the existing token without minting a new one", async () => {
    mockUserSharesRepo.getShareToken.mockResolvedValue({ shareToken: "existingToken" });
    const res = await app.request("/api/v1/users/me/share", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toBe("existingToken");
    expect(json.isPublic).toBe(true);
    expect(mockUserSharesRepo.setShareToken).not.toHaveBeenCalled();
  });

  it("mints a fresh token when none exists", async () => {
    mockUserSharesRepo.getShareToken.mockResolvedValue({ shareToken: null });
    mockUserSharesRepo.setShareToken.mockImplementation((_userId, token) =>
      Promise.resolve({ shareToken: token }),
    );
    const res = await app.request("/api/v1/users/me/share", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toMatch(/^[A-Za-z0-9]+$/u);
    expect(json.isPublic).toBe(true);
    expect(mockUserSharesRepo.setShareToken).toHaveBeenCalledWith(USER_ID, expect.any(String));
  });

  it("returns 404 when the user no longer exists", async () => {
    mockUserSharesRepo.getShareToken.mockResolvedValue({ shareToken: null });
    mockUserSharesRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/users/me/share", { method: "POST" });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toBe("User not found");
  });
});

describe("DELETE /api/v1/users/me/share (disable)", () => {
  it("returns 204 and nulls the token", async () => {
    mockUserSharesRepo.setShareToken.mockResolvedValue({ shareToken: null });
    const res = await app.request("/api/v1/users/me/share", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockUserSharesRepo.setShareToken).toHaveBeenCalledWith(USER_ID, null);
  });

  it("returns 404 when the user no longer exists", async () => {
    mockUserSharesRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/users/me/share", { method: "DELETE" });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toBe("User not found");
  });
});

describe("POST /api/v1/users/me/share/rotate", () => {
  it("overwrites the token and returns the new state", async () => {
    mockUserSharesRepo.setShareToken.mockImplementation((_userId, token) =>
      Promise.resolve({ shareToken: token }),
    );
    const res = await app.request("/api/v1/users/me/share/rotate", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toMatch(/^[A-Za-z0-9]+$/u);
    expect(json.isPublic).toBe(true);
    expect(mockUserSharesRepo.setShareToken).toHaveBeenCalledWith(USER_ID, expect.any(String));
  });

  it("returns 404 when the user no longer exists", async () => {
    mockUserSharesRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/users/me/share/rotate", { method: "POST" });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toBe("User not found");
  });
});
