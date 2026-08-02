import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { cardTradesRouter } from "./card-trades";

// ---------------------------------------------------------------------------
// Mock repos and services
// ---------------------------------------------------------------------------

const mockCardTradesRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  actionNeededCountsForUser: vi.fn(() => Promise.resolve([] as object[])),
  liveAnnotationsForUser: vi.fn(() => Promise.resolve([] as object[])),
};

const mockCreateTrade = vi.fn(() => Promise.resolve({} as object));
const mockAcceptTrade = vi.fn(() => Promise.resolve({} as object));
const mockListTradeCopyOptions = vi.fn(() => Promise.resolve({} as object));
const mockDeclineTrade = vi.fn(() => Promise.resolve({} as object));
const mockCancelTrade = vi.fn(() => Promise.resolve({} as object));
const mockCompleteTrade = vi.fn(() => Promise.resolve({} as object));
const mockSetTradeQuantity = vi.fn(() => Promise.resolve({} as object));
const mockApplyTradeSync = vi.fn(() => Promise.resolve({} as object));
const mockSkipTradeSync = vi.fn(() => Promise.resolve({} as object));

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("transact", (() => {}) as never);
  c.set("repos", { cardTrades: mockCardTradesRepo } as never);
  c.set("services", {
    createTrade: mockCreateTrade,
    listTradeCopyOptions: mockListTradeCopyOptions,
    acceptTrade: mockAcceptTrade,
    declineTrade: mockDeclineTrade,
    cancelTrade: mockCancelTrade,
    completeTrade: mockCompleteTrade,
    setTradeQuantity: mockSetTradeQuantity,
    applyTradeSync: mockApplyTradeSync,
    skipTradeSync: mockSkipTradeSync,
  } as never);
  await next();
});
registerRouterForTest(app, cardTradesRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TRADE_ID = "a0000000-0001-4000-a000-000000000020";
const PRINTING_ID = "a0000000-0001-4000-a000-000000000030";
const COUNTERPARTY_ID = "a0000000-0001-4000-a000-000000000002";
const COPY_ID = "a0000000-0001-4000-a000-000000000060";

const tradeResponse = {
  id: TRADE_ID,
  groupId: "a0000000-0001-4000-a000-000000000040",
  groupSlug: "friday-night",
  role: "giver" as const,
  initiator: "giver" as const,
  counterparty: {
    userId: COUNTERPARTY_ID,
    name: "Bob",
    image: null,
    gravatarHash: "hash",
    contactMethods: [],
  },
  printingId: PRINTING_ID,
  cardId: "OGS-001",
  quantity: 2,
  status: "pending" as const,
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
  acceptedAt: null,
  completedAt: null,
  closedAt: null,
  expiresAt: null,
  viewerSyncAppliedAt: null,
  counterpartySyncAppliedAt: null,
  actionNeeded: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => vi.resetAllMocks());

describe("POST /api/v1/trades", () => {
  it("returns 201 with the created trade", async () => {
    mockCreateTrade.mockResolvedValue(tradeResponse);
    const res = await app.request("/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupSlug: "friday-night",
        counterpartyUserId: COUNTERPARTY_ID,
        role: "giver",
        printingId: PRINTING_ID,
        quantity: 2,
      }),
    });
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.id).toBe(TRADE_ID);
    expect(mockCreateTrade).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        callerUserId: USER_ID,
        groupSlug: "friday-night",
        counterpartyUserId: COUNTERPARTY_ID,
        role: "giver",
        printingId: PRINTING_ID,
        quantity: 2,
      }),
    );
  });

  it("returns 409 and the AppError message when the service throws", async () => {
    mockCreateTrade.mockRejectedValue(
      new AppError(409, "CONFLICT", "A matching trade already exists"),
    );
    const res = await app.request("/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupSlug: "friday-night",
        counterpartyUserId: COUNTERPARTY_ID,
        role: "giver",
        printingId: PRINTING_ID,
        quantity: 2,
      }),
    });
    expect(res.status).toBe(409);
    const lintBody = await readJson(res);
    expect(lintBody.message).toBe("A matching trade already exists");
  });
});

describe("GET /api/v1/trades", () => {
  it("returns 200 with the user's trades", async () => {
    mockCardTradesRepo.listForUser.mockResolvedValue([tradeResponse]);
    const res = await app.request("/api/v1/trades");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(TRADE_ID);
    expect(mockCardTradesRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      groupId: undefined,
      status: undefined,
    });
  });

  it("forwards groupId and status filters to the repo", async () => {
    mockCardTradesRepo.listForUser.mockResolvedValue([]);
    const groupId = "a0000000-0001-4000-a000-000000000040";
    await app.request(`/api/v1/trades?groupId=${groupId}&status=pending`);
    expect(mockCardTradesRepo.listForUser).toHaveBeenCalledWith(USER_ID, {
      groupId,
      status: "pending",
    });
  });
});

describe("GET /api/v1/trades/action-counts", () => {
  it("returns 200 with the total summed across groups", async () => {
    mockCardTradesRepo.actionNeededCountsForUser.mockResolvedValue([
      { groupId: "g1", groupSlug: "alpha", count: 2 },
      { groupId: "g2", groupSlug: "beta", count: 3 },
    ]);
    const res = await app.request("/api/v1/trades/action-counts");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.total).toBe(5);
    expect(json.byGroup).toHaveLength(2);
  });

  it("returns total 0 when no groups need action", async () => {
    mockCardTradesRepo.actionNeededCountsForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/trades/action-counts");
    const json = await readJson(res);
    expect(json.total).toBe(0);
    expect(json.byGroup).toEqual([]);
  });
});

describe("GET /api/v1/trades/live-by-printing", () => {
  const PRINTING_B = "a0000000-0001-4000-a000-000000000031";

  it("returns the viewer's annotations, ordered by the presenter", async () => {
    mockCardTradesRepo.liveAnnotationsForUser.mockResolvedValue([
      { printingId: PRINTING_B, role: "receiver", phase: "asked", tradeCount: 1, quantity: 1 },
      { printingId: PRINTING_ID, role: "giver", phase: "asked", tradeCount: 2, quantity: 3 },
      { printingId: PRINTING_ID, role: "giver", phase: "reserved", tradeCount: 1, quantity: 1 },
    ]);
    const res = await app.request("/api/v1/trades/live-by-printing");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.annotations.map((row: { phase: string }) => row.phase)).toEqual([
      "reserved",
      "asked",
      "asked",
    ]);
    expect(mockCardTradesRepo.liveAnnotationsForUser).toHaveBeenCalledWith(USER_ID);
  });

  // The endpoint feeds a card browser, where a leaked counterparty or group
  // would put an in-progress negotiation on a shoulder-surfable surface.
  it("carries no counterparty, group or user identity", async () => {
    mockCardTradesRepo.liveAnnotationsForUser.mockResolvedValue([
      { printingId: PRINTING_ID, role: "giver", phase: "traded", tradeCount: 1, quantity: 4 },
    ]);
    const res = await app.request("/api/v1/trades/live-by-printing");
    const json = await readJson(res);
    expect(json.annotations[0]).toEqual({
      printingId: PRINTING_ID,
      role: "giver",
      phase: "traded",
      tradeCount: 1,
      quantity: 4,
    });
  });

  it("returns an empty list when nothing is live", async () => {
    mockCardTradesRepo.liveAnnotationsForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/trades/live-by-printing");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.annotations).toEqual([]);
  });
});

describe("GET /api/v1/trades/:id/copy-options", () => {
  it("returns the giver's candidate copies", async () => {
    mockListTradeCopyOptions.mockResolvedValue({
      tradeId: TRADE_ID,
      quantity: 1,
      choiceMatters: true,
      copies: [
        {
          id: COPY_ID,
          collectionId: "a0000000-0001-4000-a000-000000000050",
          collectionName: "Trade Binder",
          condition: null,
          grader: null,
          grade: null,
          notesPublic: null,
          notesPrivate: null,
          isAltered: false,
          links: [],
          hasRecordedDetails: false,
        },
      ],
    });
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/copy-options`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.choiceMatters).toBe(true);
    expect(json.copies).toHaveLength(1);
    expect(mockListTradeCopyOptions).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID);
  });

  it("returns 403 when the viewer is not the giver", async () => {
    mockListTradeCopyOptions.mockRejectedValue(
      new AppError(403, "FORBIDDEN", "Only the giver can see the copies behind this trade"),
    );
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/copy-options`);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/v1/trades/:id/accept", () => {
  it("returns 200 with the updated trade", async () => {
    mockAcceptTrade.mockResolvedValue({ ...tradeResponse, status: "reserved" });
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/accept`, { method: "POST" });
    expect(res.status).toBe(200);
    const lintBody = await readJson(res);
    expect(lintBody.status).toBe("reserved");
    expect(mockAcceptTrade).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID, undefined);
  });

  it("forwards the giver's chosen copy ids to the service", async () => {
    mockAcceptTrade.mockResolvedValue({ ...tradeResponse, status: "reserved" });
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds: [COPY_ID] }),
    });
    expect(res.status).toBe(200);
    expect(mockAcceptTrade).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID, [COPY_ID]);
  });

  it("rejects an empty copy-id list at the schema", async () => {
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds: [] }),
    });
    expect(res.status).toBe(400);
    expect(mockAcceptTrade).not.toHaveBeenCalled();
  });

  it("returns 404 when the service throws not-found", async () => {
    mockAcceptTrade.mockRejectedValue(new AppError(404, "NOT_FOUND", "Trade not found"));
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/accept`, { method: "POST" });
    expect(res.status).toBe(404);
    const lintBody = await readJson(res);
    expect(lintBody.message).toBe("Trade not found");
  });
});

describe("POST /api/v1/trades/:id/decline", () => {
  it("returns 200 with the updated trade", async () => {
    mockDeclineTrade.mockResolvedValue({ ...tradeResponse, status: "declined" });
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/decline`, { method: "POST" });
    expect(res.status).toBe(200);
    const lintBody = await readJson(res);
    expect(lintBody.status).toBe("declined");
    expect(mockDeclineTrade).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID);
  });
});

describe("POST /api/v1/trades/:id/cancel", () => {
  it("returns 200 with the updated trade", async () => {
    mockCancelTrade.mockResolvedValue({ ...tradeResponse, status: "cancelled" });
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/cancel`, { method: "POST" });
    expect(res.status).toBe(200);
    const lintBody = await readJson(res);
    expect(lintBody.status).toBe("cancelled");
    expect(mockCancelTrade).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID);
  });
});

describe("POST /api/v1/trades/:id/complete", () => {
  it("returns 200 with the updated trade", async () => {
    mockCompleteTrade.mockResolvedValue({ ...tradeResponse, status: "completed" });
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/complete`, { method: "POST" });
    expect(res.status).toBe(200);
    const lintBody = await readJson(res);
    expect(lintBody.status).toBe("completed");
    expect(mockCompleteTrade).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID);
  });

  it("returns 409 when the service rejects completion", async () => {
    mockCompleteTrade.mockRejectedValue(
      new AppError(409, "CONFLICT", "Trade is not ready to complete"),
    );
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/complete`, { method: "POST" });
    expect(res.status).toBe(409);
    const lintBody = await readJson(res);
    expect(lintBody.message).toBe("Trade is not ready to complete");
  });
});

describe("POST /api/v1/trades/:id/quantity", () => {
  it("returns 200 and forwards the new quantity", async () => {
    mockSetTradeQuantity.mockResolvedValue({ ...tradeResponse, quantity: 5 });
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/quantity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 5 }),
    });
    expect(res.status).toBe(200);
    const lintBody = await readJson(res);
    expect(lintBody.quantity).toBe(5);
    expect(mockSetTradeQuantity).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID, 5);
  });
});

describe("POST /api/v1/trades/:id/sync", () => {
  it("returns 200 and forwards the target collection id", async () => {
    mockApplyTradeSync.mockResolvedValue(tradeResponse);
    const targetCollectionId = "a0000000-0001-4000-a000-000000000099";
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetCollectionId }),
    });
    expect(res.status).toBe(200);
    expect(mockApplyTradeSync).toHaveBeenCalledWith(
      expect.anything(),
      TRADE_ID,
      USER_ID,
      targetCollectionId,
    );
  });
});

describe("POST /api/v1/trades/:id/sync/skip", () => {
  it("returns 200 with the updated trade", async () => {
    mockSkipTradeSync.mockResolvedValue(tradeResponse);
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/sync/skip`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockSkipTradeSync).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID);
  });
});
