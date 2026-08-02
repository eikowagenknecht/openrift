import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicListsRouter } from "./lists";

const mockListsRepo = {
  findByShareToken: vi.fn(
    () =>
      Promise.resolve(undefined) as Promise<
        { list: Record<string, unknown>; ownerName: string | null; ownerEmail: string } | undefined
      >,
  ),
  entriesWithDetailsAnon: vi.fn(() => Promise.resolve([] as object[])),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    lists: mockListsRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, publicListsRouter);

const LIST_ID = "a0000000-0001-4000-a000-000000000010";
const NOW = new Date("2026-04-20T00:00:00Z");

const dbList = {
  id: LIST_ID,
  name: "Trade Binder",
  intent: "trade" as const,
  kind: "card" as const,
  createdAt: NOW,
  updatedAt: NOW,
  defaultPricePref: null,
  defaultPriceAbsoluteCents: null,
  defaultTradeType: null,
  currency: null,
};

const dbEntry = {
  kind: "card" as const,
  id: "a0000000-0001-4000-a000-000000000020",
  listId: LIST_ID,
  quantity: 2,
  ruleQuantity: 0,
  source: "manual" as const,
  cardId: "c0000000-0001-4000-a000-000000000001",
  cardName: "Jinx, Rebel",
  tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
};

describe("GET /api/v1/lists/share/:token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with the public list, entries, and owner display name", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue({
      list: dbList,
      ownerName: "Alice",
      ownerEmail: "alice@example.com",
    });
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([dbEntry]);

    const res = await app.request("/api/v1/lists/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.list.id).toBe(LIST_ID);
    expect(json.list.name).toBe("Trade Binder");
    expect(json.list.intent).toBe("trade");
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0]).toMatchObject({
      kind: "card",
      id: dbEntry.id,
      cardId: dbEntry.cardId,
      cardName: "Jinx, Rebel",
    });
    expect(json.owner.displayName).toBe("Alice");
    expect(json.owner.gravatarHash).toEqual(expect.any(String));
    expect(mockListsRepo.entriesWithDetailsAnon).toHaveBeenCalledWith(LIST_ID, dbList.kind);
  });

  it("falls back to 'Anonymous' when the owner has no display name", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue({
      list: dbList,
      ownerName: null,
      ownerEmail: "alice@example.com",
    });
    mockListsRepo.entriesWithDetailsAnon.mockResolvedValue([]);

    const res = await app.request("/api/v1/lists/share/tok-abc");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.owner.displayName).toBe("Anonymous");
    expect(json.entries).toEqual([]);
  });

  it("returns 404 when the token is not found or the list is not public", async () => {
    mockListsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/lists/share/unknown");
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockListsRepo.entriesWithDetailsAnon).not.toHaveBeenCalled();
  });
});
