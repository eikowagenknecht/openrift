import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicTierListsRouter } from "./tier-lists";

const mockRepo = { findByShareToken: vi.fn() };

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  // No session: share links are followed anonymously, which is the point.
  c.set("repos", { tierLists: mockRepo } as never);
  await next();
});
registerRouterForTest(app, publicTierListsRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

beforeEach(() => vi.resetAllMocks());

const now = new Date("2026-08-14T00:00:00Z");

function sharedRow(overrides: Record<string, unknown> = {}) {
  return {
    tierList: {
      id: "list-1",
      userId: "user-1",
      title: "Origins ranked",
      description: null,
      setId: null,
      tiers: [{ label: "S", cards: [{ cardId: "c-1", printingId: null }] }],
      isPublic: true,
      shareToken: "AbC123XyZ789",
      createdAt: now,
      updatedAt: now,
    },
    ownerName: "Rell",
    ownerEmail: "owner@example.com",
    ...overrides,
  };
}

describe("GET /api/v1/tier-lists/share/{token}", () => {
  it("resolves a shared list without a session", async () => {
    mockRepo.findByShareToken.mockResolvedValue(sharedRow());

    const res = await app.request("/api/v1/tier-lists/share/AbC123XyZ789");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.tierList.title).toBe("Origins ranked");
    expect(json.tierList.tiers).toEqual([
      { label: "S", cards: [{ cardId: "c-1", printingId: null }] },
    ]);
    expect(json.owner.displayName).toBe("Rell");
    expect(mockRepo.findByShareToken).toHaveBeenCalledWith("AbC123XyZ789");
  });

  it("exposes neither the share state nor the owner's identifiers", async () => {
    mockRepo.findByShareToken.mockResolvedValue(sharedRow());

    const json = await readJson(await app.request("/api/v1/tier-lists/share/AbC123XyZ789"));

    expect(json.tierList.shareToken).toBeUndefined();
    expect(json.tierList.isPublic).toBeUndefined();
    expect(json.tierList.userId).toBeUndefined();
    expect(json.owner.gravatarHash).not.toContain("@");
    expect(JSON.stringify(json)).not.toContain("owner@example.com");
  });

  it("404s for an unknown or revoked token", async () => {
    mockRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/tier-lists/share/revoked-or-never-was");

    expect(res.status).toBe(404);
  });

  it("falls back to Anonymous when the owner has no display name", async () => {
    mockRepo.findByShareToken.mockResolvedValue(sharedRow({ ownerName: null }));

    const json = await readJson(await app.request("/api/v1/tier-lists/share/AbC123XyZ789"));

    expect(json.owner.displayName).toBe("Anonymous");
  });
});
