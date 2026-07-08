import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminIgnoredCandidatesRouter } from "./ignored-candidates";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  listIgnoredCards: vi.fn(),
  listIgnoredPrintings: vi.fn(),
  ignoreCard: vi.fn(),
  unignoreCard: vi.fn(),
  ignorePrinting: vi.fn(),
  unignorePrinting: vi.fn(),
};

// Audit event sink (record-admin-event.ts); handlers write here best-effort.
const mockAdminEvents = { insert: vi.fn() };

// ---------------------------------------------------------------------------
// Test app — mount the oRPC router directly (without the requireAdmin gate).
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { ignoredCandidates: mockRepo, adminEvents: mockAdminEvents } as never);
  await next();
});
registerRouterForTest(app, adminIgnoredCandidatesRouter);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const now = new Date("2026-03-17T00:00:00Z");

const dbIgnoredCard = {
  id: "a0000000-0001-4000-a000-000000000010",
  provider: "tcgplayer",
  externalId: "12345",
  createdAt: now,
};

const dbIgnoredCard2 = {
  id: "a0000000-0001-4000-a000-000000000011",
  provider: "cardmarket",
  externalId: "67890",
  createdAt: now,
};

const dbIgnoredPrinting = {
  id: "a0000000-0001-4000-a000-000000000020",
  provider: "tcgplayer",
  externalId: "54321",
  finish: "foil",
  createdAt: now,
};

const dbIgnoredPrintingNullFinish = {
  id: "a0000000-0001-4000-a000-000000000021",
  provider: "cardmarket",
  externalId: "99999",
  finish: null,
  createdAt: now,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/v1/ignored-candidates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with cards and printings", async () => {
    mockRepo.listIgnoredCards.mockResolvedValue([dbIgnoredCard, dbIgnoredCard2]);
    mockRepo.listIgnoredPrintings.mockResolvedValue([
      dbIgnoredPrinting,
      dbIgnoredPrintingNullFinish,
    ]);
    const res = await app.request("/api/admin/v1/ignored-candidates");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cards).toHaveLength(2);
    expect(json.cards[0]).toEqual({
      id: dbIgnoredCard.id,
      provider: "tcgplayer",
      externalId: "12345",
      createdAt: now.toISOString(),
    });
    expect(json.cards[1]).toEqual({
      id: dbIgnoredCard2.id,
      provider: "cardmarket",
      externalId: "67890",
      createdAt: now.toISOString(),
    });
    expect(json.printings).toHaveLength(2);
    expect(json.printings[0]).toEqual({
      id: dbIgnoredPrinting.id,
      provider: "tcgplayer",
      externalId: "54321",
      finish: "foil",
      createdAt: now.toISOString(),
    });
    expect(json.printings[1]).toEqual({
      id: dbIgnoredPrintingNullFinish.id,
      provider: "cardmarket",
      externalId: "99999",
      finish: null,
      createdAt: now.toISOString(),
    });
  });

  it("returns empty arrays when nothing is ignored", async () => {
    mockRepo.listIgnoredCards.mockResolvedValue([]);
    mockRepo.listIgnoredPrintings.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/ignored-candidates");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cards).toEqual([]);
    expect(json.printings).toEqual([]);
  });
});

describe("POST /api/admin/v1/ignored-candidates/cards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when card is ignored", async () => {
    mockRepo.ignoreCard.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/ignored-candidates/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "tcgplayer", externalId: "12345" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.ignoreCard).toHaveBeenCalledWith({
      provider: "tcgplayer",
      externalId: "12345",
    });
  });
});

describe("DELETE /api/admin/v1/ignored-candidates/cards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when card is unignored", async () => {
    mockRepo.unignoreCard.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/ignored-candidates/cards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "tcgplayer", externalId: "12345" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.unignoreCard).toHaveBeenCalledWith("tcgplayer", "12345");
  });
});

describe("POST /api/admin/v1/ignored-candidates/printings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when printing is ignored with finish", async () => {
    mockRepo.ignorePrinting.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/ignored-candidates/printings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "tcgplayer", externalId: "54321", finish: "foil" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.ignorePrinting).toHaveBeenCalledWith({
      provider: "tcgplayer",
      externalId: "54321",
      finish: "foil",
    });
  });

  it("returns 204 when printing is ignored with null finish", async () => {
    mockRepo.ignorePrinting.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/ignored-candidates/printings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "tcgplayer", externalId: "54321", finish: null }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.ignorePrinting).toHaveBeenCalledWith({
      provider: "tcgplayer",
      externalId: "54321",
      finish: null,
    });
  });

  it("defaults finish to null when omitted", async () => {
    mockRepo.ignorePrinting.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/ignored-candidates/printings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "tcgplayer", externalId: "54321" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.ignorePrinting).toHaveBeenCalledWith({
      provider: "tcgplayer",
      externalId: "54321",
      finish: null,
    });
  });
});

describe("DELETE /api/admin/v1/ignored-candidates/printings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when printing is unignored with finish", async () => {
    mockRepo.unignorePrinting.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/ignored-candidates/printings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "tcgplayer", externalId: "54321", finish: "foil" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.unignorePrinting).toHaveBeenCalledWith("tcgplayer", "54321", "foil");
  });

  it("returns 204 when printing is unignored with null finish", async () => {
    mockRepo.unignorePrinting.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/ignored-candidates/printings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "tcgplayer", externalId: "54321", finish: null }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.unignorePrinting).toHaveBeenCalledWith("tcgplayer", "54321", null);
  });
});

describe("audit events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ignoring a card records a composite-id event", async () => {
    mockRepo.ignoreCard.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/ignored-candidates/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "gallery", externalId: "ext-1" }),
    });
    expect(res.status).toBe(204);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "candidate-card.ignore",
        entityType: "candidate-card",
        entityId: "gallery:ext-1",
        newValues: { provider: "gallery", externalId: "ext-1" },
      }),
    );
  });
});
