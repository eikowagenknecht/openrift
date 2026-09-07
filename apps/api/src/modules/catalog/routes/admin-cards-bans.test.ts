import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminCardBansRouter } from "./admin-cards-bans";

const CARD_ID = "019cfc3b-0389-744b-837c-792fd586300e";

const mockCardBans = {
  listByCard: vi.fn(),
  findActiveBan: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  unban: vi.fn(),
};

const mockCatalog = {
  cardById: vi.fn(),
};

const mockCatalogMutations = { getCardById: vi.fn() };
const mockAdminEvents = { insert: vi.fn() };

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    cardBans: mockCardBans,
    catalog: mockCatalog,
    catalogMutations: mockCatalogMutations,
    adminEvents: mockAdminEvents,
  } as never);
  c.set("user", { id: "a0000000-0001-4000-a000-000000000001" } as never);
  await next();
});
registerRouterForTest(app, adminCardBansRouter);

const banRow = {
  id: "019d6a00-1234-7000-8000-000000000001",
  cardId: CARD_ID,
  formatId: "standard",
  formatName: "Standard",
  bannedAt: "2026-01-15",
  reason: "Power level concerns",
  createdAt: new Date("2026-01-15T12:00:00.000Z"),
};

const banResponse = { ...banRow, createdAt: "2026-01-15T12:00:00.000Z" };

describe("GET /api/admin/v1/cards/:id/bans", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the active bans with an ISO createdAt", async () => {
    mockCardBans.listByCard.mockResolvedValue([banRow]);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ bans: [banResponse] });
    expect(mockCardBans.listByCard).toHaveBeenCalledWith(CARD_ID);
  });

  it("returns an empty list when the card has no bans", async () => {
    mockCardBans.listByCard.mockResolvedValue([]);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ bans: [] });
  });
});

describe("POST /api/admin/v1/cards/:id/bans", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a ban and returns 201", async () => {
    mockCatalog.cardById.mockResolvedValue({ id: CARD_ID });
    mockCardBans.findActiveBan.mockResolvedValue(null);
    mockCardBans.create.mockResolvedValue(banRow);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formatId: "standard",
        bannedAt: "2026-01-15",
        reason: "Power level concerns",
      }),
    });

    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json).toEqual({ ban: banResponse });
    expect(mockCardBans.create).toHaveBeenCalledWith({
      cardId: CARD_ID,
      formatId: "standard",
      bannedAt: "2026-01-15",
      reason: "Power level concerns",
    });
  });

  it("defaults a missing reason to null", async () => {
    mockCatalog.cardById.mockResolvedValue({ id: CARD_ID });
    mockCardBans.findActiveBan.mockResolvedValue(null);
    mockCardBans.create.mockResolvedValue({ ...banRow, reason: null });

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard", bannedAt: "2026-01-15" }),
    });

    expect(res.status).toBe(201);
    expect(mockCardBans.create).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
  });

  it("404s when the card does not exist", async () => {
    mockCatalog.cardById.mockResolvedValue(null);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard", bannedAt: "2026-01-15" }),
    });

    expect(res.status).toBe(404);
    expect(mockCardBans.create).not.toHaveBeenCalled();
  });

  it("409s when the card is already banned in the format", async () => {
    mockCatalog.cardById.mockResolvedValue({ id: CARD_ID });
    mockCardBans.findActiveBan.mockResolvedValue(banRow);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard", bannedAt: "2026-01-15" }),
    });

    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.message).toContain("already banned");
    expect(mockCardBans.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/v1/cards/:id/bans", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates the ban and returns it", async () => {
    mockCardBans.update.mockResolvedValue({ ...banRow, reason: "Updated" });

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard", reason: "Updated" }),
    });

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.ban.reason).toBe("Updated");
    expect(mockCardBans.update).toHaveBeenCalledWith(CARD_ID, "standard", { reason: "Updated" });
  });

  it("passes only the provided fields through to the repo", async () => {
    mockCardBans.update.mockResolvedValue(banRow);

    await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard", bannedAt: "2026-02-01" }),
    });

    expect(mockCardBans.update).toHaveBeenCalledWith(CARD_ID, "standard", {
      bannedAt: "2026-02-01",
    });
  });

  it("404s when there is no active ban for the format", async () => {
    mockCardBans.update.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard", reason: "x" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/v1/cards/:id/bans", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("removes the ban and returns 204", async () => {
    mockCardBans.unban.mockResolvedValue(true);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard" }),
    });

    expect(res.status).toBe(204);
    expect(mockCardBans.unban).toHaveBeenCalledWith(CARD_ID, "standard");
  });

  it("404s when no active ban matched the format", async () => {
    mockCardBans.unban.mockResolvedValue(false);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard" }),
    });

    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toContain("No active ban found");
    expect(mockCardBans.unban).toHaveBeenCalledWith(CARD_ID, "standard");
  });
});

describe("audit events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ban create records an event with the card label", async () => {
    mockCatalog.cardById.mockResolvedValue({ id: CARD_ID });
    mockCardBans.findActiveBan.mockResolvedValue(null);
    mockCardBans.create.mockResolvedValue(banRow);
    mockCatalogMutations.getCardById.mockResolvedValue({
      id: CARD_ID,
      name: "Fireball",
      slug: "fireball",
    });

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard", bannedAt: "2026-01-15" }),
    });
    expect(res.status).toBe(201);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ban.add",
        entityType: "ban",
        entityLabel: "Fireball",
        cardSlug: "fireball",
        newValues: expect.objectContaining({ formatId: "standard" }),
      }),
    );
  });

  it("ban removal records the prior ban as oldValues", async () => {
    mockCardBans.findActiveBan.mockResolvedValue(banRow);
    mockCardBans.unban.mockResolvedValue(true);

    const res = await app.request(`/api/admin/v1/cards/${CARD_ID}/bans`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formatId: "standard" }),
    });
    expect(res.status).toBe(204);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ban.delete",
        oldValues: expect.objectContaining({ formatId: "standard" }),
      }),
    );
  });
});
