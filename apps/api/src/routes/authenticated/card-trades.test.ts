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
  listDtoRowsForUser: vi.fn(() => Promise.resolve([] as object[])),
  actionNeededCountsForUser: vi.fn(() => Promise.resolve([] as object[])),
  liveAnnotationsForUser: vi.fn(() => Promise.resolve([] as object[])),
};

const mockFriendGroupsRepo = {
  sharedGroups: vi.fn(() => Promise.resolve([] as object[])),
  listMembers: vi.fn(() => Promise.resolve([] as object[])),
  getRevealedContactsForMembers: vi.fn(() => Promise.resolve(new Map<string, object[]>())),
};

const mockFriendGroupMatchesRepo = {
  othersHaveYourWants: vi.fn(() => Promise.resolve([] as object[])),
  othersWantYourHaves: vi.fn(() => Promise.resolve([] as object[])),
};

const mockCreateTrade = vi.fn(() => Promise.resolve({} as object));
const mockAcceptTrade = vi.fn(() => Promise.resolve({} as object));
const mockListTradeCopyOptions = vi.fn(() => Promise.resolve({} as object));
const mockDeclineTrade = vi.fn(() => Promise.resolve({} as object));
const mockCancelTrade = vi.fn(() => Promise.resolve({} as object));
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
  c.set("repos", {
    cardTrades: mockCardTradesRepo,
    friendGroups: mockFriendGroupsRepo,
    friendGroupMatches: mockFriendGroupMatchesRepo,
  } as never);
  c.set("services", {
    createTrade: mockCreateTrade,
    listTradeCopyOptions: mockListTradeCopyOptions,
    acceptTrade: mockAcceptTrade,
    declineTrade: mockDeclineTrade,
    cancelTrade: mockCancelTrade,
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
  groupName: "Friday Night",
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

/** A trade as the DTO query hands it to the list handler, before presenting. */
const tradeRow = {
  id: TRADE_ID,
  groupId: "a0000000-0001-4000-a000-000000000040",
  groupSlug: "friday-night",
  groupLiveName: "Friday Night",
  groupSnapshotName: null,
  giverUserId: USER_ID,
  receiverUserId: COUNTERPARTY_ID,
  initiator: "giver" as const,
  printingId: PRINTING_ID,
  cardId: "OGS-001",
  quantity: 2,
  status: "pending" as const,
  giverSyncAppliedAt: null,
  receiverSyncAppliedAt: null,
  createdAt: new Date("2026-03-17T00:00:00.000Z"),
  updatedAt: new Date("2026-03-17T00:00:00.000Z"),
  acceptedAt: null,
  completedAt: null,
  closedAt: null,
  expiresAt: null,
  giverName: "Alice",
  giverImage: null,
  giverEmail: "alice@example.com",
  giverSnapshotName: null,
  receiverName: "Bob",
  receiverImage: null,
  receiverEmail: "bob@example.com",
  receiverSnapshotName: null,
  counterpartyContacts: [],
};

const GROUP_A = {
  id: "a0000000-0001-4000-a000-000000000041",
  slug: "arcane-nights",
  name: "Arcane Nights",
};
const GROUP_B = {
  id: "a0000000-0001-4000-a000-000000000042",
  slug: "bilgewater-bay",
  name: "Bilgewater Bay",
};

const counterpartyMember = {
  userId: COUNTERPARTY_ID,
  userName: "Ekko",
  userEmail: "ekko@example.com",
  userImage: null,
};

const tradePref = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
  currency: null,
};

/** @returns A match row as the match repo hands it to the sheet handler. */
function matchRow(overrides: Record<string, unknown> = {}) {
  return {
    counterpartyUserId: COUNTERPARTY_ID,
    counterpartyName: "Ekko",
    counterpartyImage: null,
    counterpartyGravatarHash: "hash",
    counterpartyListId: "list-sell",
    counterpartyListName: "Trade Binder",
    viewerListName: "Wants",
    sellEntryId: "entry-sell",
    sellListId: "list-sell",
    copyId: COPY_ID,
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    printingId: PRINTING_ID,
    cardId: "OGS-001",
    cardName: "Jinx, Rebel",
    setId: "OGN",
    rarity: "Epic",
    finish: "foil",
    imageId: null,
    buyEntryId: "entry-buy",
    buyListId: "list-buy",
    buyEntryKind: "printing",
    buyQuantity: 1,
    sellPref: tradePref,
    buyPref: tradePref,
    ...overrides,
  };
}

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
  it("returns 200 with the user's trades, oriented to them", async () => {
    mockCardTradesRepo.listDtoRowsForUser.mockResolvedValue([tradeRow]);
    const res = await app.request("/api/v1/trades");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(TRADE_ID);
    expect(json.items[0].role).toBe("giver");
    expect(json.items[0].counterparty.userId).toBe(COUNTERPARTY_ID);
    expect(mockCardTradesRepo.listDtoRowsForUser).toHaveBeenCalledWith(USER_ID, {
      groupId: undefined,
      status: undefined,
    });
  });

  it("forwards groupId and status filters to the repo", async () => {
    mockCardTradesRepo.listDtoRowsForUser.mockResolvedValue([]);
    const groupId = "a0000000-0001-4000-a000-000000000040";
    await app.request(`/api/v1/trades?groupId=${groupId}&status=pending`);
    expect(mockCardTradesRepo.listDtoRowsForUser).toHaveBeenCalledWith(USER_ID, {
      groupId,
      status: "pending",
    });
  });
});

describe("GET /api/v1/trades/action-counts", () => {
  it("returns 200 with the total summed across groups", async () => {
    mockCardTradesRepo.actionNeededCountsForUser.mockResolvedValue([
      { groupId: "g1", groupSlug: "alpha", count: 2, respondCount: 2, settleCount: 0 },
      { groupId: "g2", groupSlug: "beta", count: 3, respondCount: 1, settleCount: 2 },
    ]);
    const res = await app.request("/api/v1/trades/action-counts");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.total).toBe(5);
    expect(json.byGroup).toHaveLength(2);
  });

  it("carries each group's per-action-type split through to the response", async () => {
    mockCardTradesRepo.actionNeededCountsForUser.mockResolvedValue([
      { groupId: "g1", groupSlug: "alpha", count: 44, respondCount: 12, settleCount: 32 },
    ]);
    const res = await app.request("/api/v1/trades/action-counts");
    const json = await readJson(res);
    expect(json.byGroup[0]).toMatchObject({ count: 44, respondCount: 12, settleCount: 32 });
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
      { printingId: PRINTING_ID, role: "giver", phase: "reserved", tradeCount: 1, quantity: 4 },
    ]);
    const res = await app.request("/api/v1/trades/live-by-printing");
    const json = await readJson(res);
    expect(json.annotations[0]).toEqual({
      printingId: PRINTING_ID,
      role: "giver",
      phase: "reserved",
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

describe("GET /api/v1/trades/with/:userId", () => {
  /** Points the roster and contact reads at the counterparty in every group. */
  function seedCounterparty() {
    mockFriendGroupsRepo.listMembers.mockResolvedValue([counterpartyMember]);
    mockFriendGroupsRepo.getRevealedContactsForMembers.mockResolvedValue(
      new Map([[COUNTERPARTY_ID, [{ id: "cm-1", type: "discord", value: "ekko#1" }]]]),
    );
  }

  it("returns 400 when the viewer asks for a sheet with themselves", async () => {
    const res = await app.request(`/api/v1/trades/with/${USER_ID}`);
    expect(res.status).toBe(400);
    expect(mockFriendGroupsRepo.sharedGroups).not.toHaveBeenCalled();
  });

  // Unknown user and no shared group answer alike so the route cannot be used
  // to probe for accounts.
  it("returns 404 when the two share no group", async () => {
    mockFriendGroupsRepo.sharedGroups.mockResolvedValue([]);
    const res = await app.request(`/api/v1/trades/with/${COUNTERPARTY_ID}`);
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Member not found");
    expect(mockFriendGroupMatchesRepo.othersHaveYourWants).not.toHaveBeenCalled();
  });

  it("returns the shared groups in the repo's sorted order, with rows tagged", async () => {
    mockFriendGroupsRepo.sharedGroups.mockResolvedValue([GROUP_A, GROUP_B]);
    seedCounterparty();
    mockFriendGroupMatchesRepo.othersHaveYourWants
      .mockResolvedValueOnce([matchRow()])
      .mockResolvedValueOnce([matchRow({ copyId: "copy-from-b" })]);
    mockFriendGroupMatchesRepo.othersWantYourHaves.mockResolvedValue([]);

    const res = await app.request(`/api/v1/trades/with/${COUNTERPARTY_ID}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.groups.map((group: { slug: string }) => group.slug)).toEqual([
      "arcane-nights",
      "bilgewater-bay",
    ]);
    expect(
      json.othersHaveYourWants.map((row: { copyId: string; groupSlug: string }) => [
        row.copyId,
        row.groupSlug,
      ]),
    ).toEqual([
      [COPY_ID, "arcane-nights"],
      ["copy-from-b", "bilgewater-bay"],
    ]);
    expect(json.othersWantYourHaves).toEqual([]);
    expect(mockFriendGroupsRepo.sharedGroups).toHaveBeenCalledWith(USER_ID, COUNTERPARTY_ID);
  });

  it("scopes every match read to the viewer and the counterparty", async () => {
    mockFriendGroupsRepo.sharedGroups.mockResolvedValue([GROUP_A]);
    seedCounterparty();
    mockFriendGroupMatchesRepo.othersHaveYourWants.mockResolvedValue([]);
    mockFriendGroupMatchesRepo.othersWantYourHaves.mockResolvedValue([matchRow()]);

    await app.request(`/api/v1/trades/with/${COUNTERPARTY_ID}`);
    for (const repoFn of [
      mockFriendGroupMatchesRepo.othersHaveYourWants,
      mockFriendGroupMatchesRepo.othersWantYourHaves,
    ]) {
      expect(repoFn).toHaveBeenCalledWith({
        groupId: GROUP_A.id,
        viewerUserId: USER_ID,
        counterpartyUserId: COUNTERPARTY_ID,
      });
    }
  });

  it("collapses a row that both shared groups produce onto the first", async () => {
    mockFriendGroupsRepo.sharedGroups.mockResolvedValue([GROUP_A, GROUP_B]);
    seedCounterparty();
    mockFriendGroupMatchesRepo.othersHaveYourWants.mockResolvedValue([matchRow()]);
    mockFriendGroupMatchesRepo.othersWantYourHaves.mockResolvedValue([]);

    const res = await app.request(`/api/v1/trades/with/${COUNTERPARTY_ID}`);
    const json = await readJson(res);
    expect(json.othersHaveYourWants).toHaveLength(1);
    expect(json.othersHaveYourWants[0].groupSlug).toBe("arcane-nights");
  });

  it("returns the counterparty's profile and revealed contacts", async () => {
    mockFriendGroupsRepo.sharedGroups.mockResolvedValue([GROUP_A]);
    seedCounterparty();
    mockFriendGroupMatchesRepo.othersHaveYourWants.mockResolvedValue([]);
    mockFriendGroupMatchesRepo.othersWantYourHaves.mockResolvedValue([]);

    const res = await app.request(`/api/v1/trades/with/${COUNTERPARTY_ID}`);
    const json = await readJson(res);
    expect(json.counterparty.userId).toBe(COUNTERPARTY_ID);
    expect(json.counterparty.name).toBe("Ekko");
    expect(json.counterparty.gravatarHash).toHaveLength(64);
    expect(json.counterparty.contactMethods).toEqual([
      { id: "cm-1", type: "discord", value: "ekko#1" },
    ]);
  });

  // A shared group whose roster no longer carries the counterparty means the
  // membership went away between the two reads.
  it("returns 404 when the counterparty is not on the roster", async () => {
    mockFriendGroupsRepo.sharedGroups.mockResolvedValue([GROUP_A]);
    mockFriendGroupsRepo.listMembers.mockResolvedValue([]);
    mockFriendGroupsRepo.getRevealedContactsForMembers.mockResolvedValue(new Map());
    const res = await app.request(`/api/v1/trades/with/${COUNTERPARTY_ID}`);
    expect(res.status).toBe(404);
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
          pinned: false,
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
    expect(mockApplyTradeSync).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID, {
      targetCollectionId,
      copyIds: undefined,
      quantity: undefined,
    });
  });

  it("forwards the giver's chosen copies", async () => {
    mockApplyTradeSync.mockResolvedValue(tradeResponse);
    const copyIds = ["a0000000-0001-4000-a000-000000000011"];
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds }),
    });
    expect(res.status).toBe(200);
    expect(mockApplyTradeSync).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID, {
      targetCollectionId: undefined,
      copyIds,
      quantity: undefined,
    });
  });

  it("rejects a copy id that is not a uuid", async () => {
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds: ["not-a-uuid"] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/trades/:id/sync/skip", () => {
  it("returns 200 with the updated trade", async () => {
    mockSkipTradeSync.mockResolvedValue(tradeResponse);
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/sync/skip`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockSkipTradeSync).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID, {
      quantity: undefined,
    });
  });

  it("passes a partial quantity through", async () => {
    mockSkipTradeSync.mockResolvedValue(tradeResponse);
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/sync/skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 2 }),
    });
    expect(res.status).toBe(200);
    expect(mockSkipTradeSync).toHaveBeenCalledWith(expect.anything(), TRADE_ID, USER_ID, {
      quantity: 2,
    });
  });

  it("rejects a quantity below one", async () => {
    const res = await app.request(`/api/v1/trades/${TRADE_ID}/sync/skip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 0 }),
    });
    expect(res.status).toBe(400);
  });
});
