import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { listsRouter } from "./lists";

const mockListsRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  getIdKindIntent: vi.fn(() =>
    Promise.resolve(undefined as { id: string; kind: string; intent: string } | undefined),
  ),
  create: vi.fn(() => Promise.resolve({} as object)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteByIdForUser: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
  setShareToken: vi.fn((..._args: Parameters<Repos["lists"]["setShareToken"]>) =>
    Promise.resolve(undefined as object | undefined),
  ),
  getShareState: vi.fn(() =>
    Promise.resolve(undefined as { shareToken: string | null; isPublic: boolean } | undefined),
  ),
  findByShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  entriesWithDetails: vi.fn(() => Promise.resolve([] as object[])),
  entriesWithDetailsAnon: vi.fn(() => Promise.resolve([] as object[])),
  createEntry: vi.fn(() => Promise.resolve({} as object)),
  bulkCreateEntries: vi.fn((..._args: Parameters<Repos["lists"]["bulkCreateEntries"]>) =>
    Promise.resolve({ inserted: 0, updated: 0 }),
  ),
  bulkCreateEntriesFromCopies: vi.fn(() => Promise.resolve({ added: 0, updated: 0, skipped: 0 })),
  updateEntry: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteEntry: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
  reorder: vi.fn(() => Promise.resolve()),
};

const mockCopiesRepo = {
  existsForViewer: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  filterAccessibleByViewer: vi.fn(() => Promise.resolve([] as string[])),
};

const mockFriendGroupsRepo = {
  listGroupsSharingList: vi.fn(() => Promise.resolve([])),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const LIST_ID = "a0000000-0001-4000-a000-000000000010";
const ENTRY_ID = "a0000000-0001-4000-a000-000000000020";
const CARD_ID = "c0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "d0000000-0001-4000-a000-000000000001";
const COPY_ID = "550e8400-e29b-41d4-a716-446655440000";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    lists: mockListsRepo,
    copies: mockCopiesRepo,
    friendGroups: mockFriendGroupsRepo,
  } as never);
  await next();
});
registerRouterForTest(app, listsRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

const now = new Date("2026-05-17T00:00:00Z");

const dbList = {
  id: LIST_ID,
  userId: USER_ID,
  name: "Wants",
  intent: "wish" as const,
  kind: "card" as const,
  isPublic: false,
  shareToken: null,
  ruleCombine: null,
  defaultPricePref: null,
  defaultPriceAbsoluteCents: null,
  defaultTradeType: null,
  currency: null,
  sidebarHidden: false,
  createdAt: now,
  updatedAt: now,
};

const dbEntry = {
  id: ENTRY_ID,
  listId: LIST_ID,
  userId: USER_ID,
  kind: "card" as const,
  cardId: CARD_ID,
  printingId: null,
  copyId: null,
  quantity: 1,
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
  createdAt: now,
  updatedAt: now,
};

const dbCopyEntry = {
  ...dbEntry,
  kind: "copy" as const,
  cardId: null,
  printingId: null,
  copyId: COPY_ID,
};

describe("GET /api/v1/lists", () => {
  beforeEach(() => {
    mockListsRepo.listForUser.mockReset();
  });

  it("returns 200 with all lists for the user, surfacing entry count", async () => {
    mockListsRepo.listForUser.mockResolvedValue([{ ...dbList, entryCount: 7 }]);
    const res = await app.request("/api/v1/lists");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].intent).toBe("wish");
    expect(json.items[0].entryCount).toBe(7);
    expect(mockListsRepo.listForUser).toHaveBeenCalledWith(USER_ID, undefined);
  });

  it("forwards intent filter to repo", async () => {
    mockListsRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/lists?intent=trade");
    expect(mockListsRepo.listForUser).toHaveBeenCalledWith(USER_ID, "trade");
  });

  it("rejects an unknown intent", async () => {
    const res = await app.request("/api/v1/lists?intent=barter");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/lists", () => {
  beforeEach(() => {
    mockListsRepo.create.mockReset();
  });

  it("returns 201 with the created list", async () => {
    mockListsRepo.create.mockResolvedValue(dbList);
    const res = await app.request("/api/v1/lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Wants", intent: "wish", kind: "card" }),
    });
    expect(res.status).toBe(201);
    expect(mockListsRepo.create).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "Wants",
      intent: "wish",
      kind: "card",
      defaultPricePref: null,
      defaultPriceAbsoluteCents: null,
      defaultTradeType: null,
      currency: null,
      rules: [],
      ruleCombine: null,
    });
  });

  it("creates the list without sharing it with any group (opt-in, ADR-013)", async () => {
    mockListsRepo.create.mockResolvedValue(dbList);
    const res = await app.request("/api/v1/lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Wants", intent: "wish", kind: "card" }),
    });
    expect(res.status).toBe(201);
    expect(mockFriendGroupsRepo.listGroupsSharingList).not.toHaveBeenCalled();
  });

  it("rejects a missing intent", async () => {
    const res = await app.request("/api/v1/lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Wants", kind: "card" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing kind", async () => {
    const res = await app.request("/api/v1/lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Wants", intent: "wish" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects wish + copy (disallowed combo)", async () => {
    const res = await app.request("/api/v1/lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bad", intent: "wish", kind: "copy" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/lists/:id", () => {
  beforeEach(() => {
    mockListsRepo.getByIdForUser.mockReset();
    mockListsRepo.entriesWithDetails.mockReset();
  });

  it("returns 200 with the list and enriched entries", async () => {
    mockListsRepo.getByIdForUser.mockResolvedValue(dbList);
    mockListsRepo.entriesWithDetails.mockResolvedValue([
      {
        id: "le-1",
        listId: LIST_ID,
        kind: "card",
        ruleQuantity: 0,
        source: "manual",
        cardId: CARD_ID,
        printingId: null,
        copyId: null,
        quantity: 2,
        tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
        cardName: "Fire Dragon",
        setId: null,
        rarity: null,
        finish: null,
        imageId: null,
        collectionId: null,
        resolvedPrintingId: null,
      },
    ]);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.list.id).toBe(LIST_ID);
    expect(json.list.kind).toBe("card");
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].cardName).toBe("Fire Dragon");
    expect(mockListsRepo.entriesWithDetails).toHaveBeenCalledWith(LIST_ID, "card", USER_ID);
  });

  it("returns 404 when not owned", async () => {
    mockListsRepo.getByIdForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/lists/:id", () => {
  beforeEach(() => {
    mockListsRepo.update.mockReset();
    // updateList now looks up the list's intent to strip trade prefs on
    // organize lists; default the lookup to the (wish-intent) dbList.
    mockListsRepo.getByIdForUser.mockReset();
    mockListsRepo.getByIdForUser.mockResolvedValue(dbList);
  });

  it("returns 200 with the updated list", async () => {
    mockListsRepo.update.mockResolvedValue({ ...dbList, name: "Renamed" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.name).toBe("Renamed");
  });

  it("returns 404 when not found", async () => {
    mockListsRepo.update.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(404);
  });

  it("accepts a tradeDefaults-only patch", async () => {
    mockListsRepo.update.mockResolvedValue(dbList);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
      }),
    });
    expect(res.status).toBe(200);
    expect(mockListsRepo.update).toHaveBeenCalledWith(LIST_ID, USER_ID, {
      defaultPricePref: "cm_lowest",
      defaultPriceAbsoluteCents: null,
      defaultTradeType: "cards",
    });
  });

  it("accepts a currency-only patch", async () => {
    mockListsRepo.update.mockResolvedValue(dbList);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD" }),
    });
    expect(res.status).toBe(200);
    expect(mockListsRepo.update).toHaveBeenCalledWith(LIST_ID, USER_ID, { currency: "USD" });
  });

  it("rejects a completely empty patch with 400", async () => {
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(mockListsRepo.update).not.toHaveBeenCalled();
  });

  // Several trade rules are accepted, and the combine mode is validated
  // against the list.
  const tradeRule = {
    kind: "trade",
    filter: {},
    collectionIds: null,
    keepPerCard: { mode: "fixed", n: 1 },
    excludeCopyIds: [],
  };
  const wishRule = {
    kind: "wish",
    filter: {},
    quantity: { mode: "fixed", n: 1 },
    excludeIds: [],
  };

  it("accepts several rules on a trade list", async () => {
    const tradeList = { ...dbList, intent: "trade" as const, kind: "copy" as const };
    mockListsRepo.getByIdForUser.mockResolvedValue(tradeList);
    mockListsRepo.update.mockResolvedValue(tradeList);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules: [tradeRule, tradeRule] }),
    });
    expect(res.status).toBe(200);
  });

  // An organize list carries rules too, shaped by its kind.
  it("accepts rules on an organize list, shaped by its kind", async () => {
    const organizeCopy = { ...dbList, intent: "organize" as const, kind: "copy" as const };
    mockListsRepo.getByIdForUser.mockResolvedValue(organizeCopy);
    mockListsRepo.update.mockResolvedValue(organizeCopy);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules: [tradeRule], ruleCombine: "count-sum" }),
    });
    expect(res.status).toBe(200);
    // The filter comes back with every dimension backfilled by the schema, so
    // assert the parts the route itself decides.
    expect(mockListsRepo.update).toHaveBeenCalledWith(
      LIST_ID,
      USER_ID,
      expect.objectContaining({
        rules: [expect.objectContaining({ kind: "trade", keepPerCard: { mode: "fixed", n: 1 } })],
        ruleCombine: "count-sum",
      }),
    );
  });

  it("rejects a rule whose shape doesn't match the organize list's kind", async () => {
    mockListsRepo.getByIdForUser.mockResolvedValue({
      ...dbList,
      intent: "organize" as const,
      kind: "copy" as const,
    });
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules: [wishRule] }),
    });
    expect(res.status).toBe(400);
    expect(mockListsRepo.update).not.toHaveBeenCalled();
  });

  it("persists a combine mode matching the list kind", async () => {
    mockListsRepo.update.mockResolvedValue(dbList);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleCombine: "max" }),
    });
    expect(res.status).toBe(200);
    expect(mockListsRepo.update).toHaveBeenCalledWith(LIST_ID, USER_ID, { ruleCombine: "max" });
  });

  it("rejects a combine mode from the other kind with 400", async () => {
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // dbList is a wish list; protect is a trade mode.
      body: JSON.stringify({ ruleCombine: "protect" }),
    });
    expect(res.status).toBe(400);
    expect(mockListsRepo.update).not.toHaveBeenCalled();
  });

  it("clears the combine mode back to the default with null", async () => {
    mockListsRepo.update.mockResolvedValue(dbList);
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleCombine: null }),
    });
    expect(res.status).toBe(200);
    expect(mockListsRepo.update).toHaveBeenCalledWith(LIST_ID, USER_ID, { ruleCombine: null });
  });

  // A PATCH carrying trade prefs on an organize list strips them (the DB
  // CHECK would otherwise 500) and applies only the real fields.
  it("strips trade prefs on a PATCH to an organize list", async () => {
    mockListsRepo.getByIdForUser.mockResolvedValue({ ...dbList, intent: "organize" });
    mockListsRepo.update.mockResolvedValue({ ...dbList, intent: "organize", name: "Org" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Org",
        tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
        currency: "USD",
      }),
    });
    expect(res.status).toBe(200);
    expect(mockListsRepo.update).toHaveBeenCalledWith(LIST_ID, USER_ID, { name: "Org" });
  });
});

describe("DELETE /api/v1/lists/:id", () => {
  beforeEach(() => {
    mockListsRepo.deleteByIdForUser.mockReset();
  });

  it("returns 204 on success", async () => {
    mockListsRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("returns 404 when not found", async () => {
    mockListsRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/lists/:id/entries", () => {
  beforeEach(() => {
    mockListsRepo.getIdKindIntent.mockReset();
    mockListsRepo.createEntry.mockReset();
    mockCopiesRepo.existsForViewer.mockReset();
  });

  it("returns 201 for a card-kind list with cardId", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "card", intent: "wish" });
    mockListsRepo.createEntry.mockResolvedValue(dbEntry);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: CARD_ID }),
    });
    expect(res.status).toBe(201);
    expect(mockListsRepo.createEntry).toHaveBeenCalledWith({
      listId: LIST_ID,
      userId: USER_ID,
      kind: "card",
      cardId: CARD_ID,
      printingId: null,
      copyId: null,
      quantity: 1,
      pricePref: null,
      priceAbsoluteCents: null,
      tradeType: null,
    });
  });

  it("rejects mismatched target (card-kind list, printing in body)", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "card", intent: "wish" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: PRINTING_ID }),
    });
    expect(res.status).toBe(400);
    expect(mockListsRepo.createEntry).not.toHaveBeenCalled();
  });

  it("validates copy ownership for copy-kind lists", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "copy", intent: "trade" });
    mockCopiesRepo.existsForViewer.mockResolvedValue({ id: COPY_ID });
    mockListsRepo.createEntry.mockResolvedValue(dbCopyEntry);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyId: COPY_ID }),
    });
    expect(res.status).toBe(201);
    // Trade list → personalOnly=true: only the user's own copies may be added.
    expect(mockCopiesRepo.existsForViewer).toHaveBeenCalledWith(COPY_ID, USER_ID, true);
  });

  it("returns 404 when copy is not owned", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "copy", intent: "trade" });
    mockCopiesRepo.existsForViewer.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyId: COPY_ID }),
    });
    expect(res.status).toBe(404);
    expect(mockListsRepo.createEntry).not.toHaveBeenCalled();
  });

  it("returns 404 when the list doesn't exist for the user", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: CARD_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an entry with no target", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "card", intent: "wish" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an entry with two targets", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "card", intent: "wish" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: CARD_ID, printingId: PRINTING_ID }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/lists/:id/entries/bulk", () => {
  beforeEach(() => {
    mockListsRepo.getIdKindIntent.mockReset();
    mockListsRepo.bulkCreateEntries.mockReset();
    mockCopiesRepo.filterAccessibleByViewer.mockReset();
  });

  it("filters non-owned copies (copy-kind list)", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "copy", intent: "trade" });
    mockCopiesRepo.filterAccessibleByViewer.mockResolvedValue([COPY_ID]);
    mockListsRepo.bulkCreateEntries.mockResolvedValue({ inserted: 1, updated: 0 });

    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [
          { copyId: COPY_ID },
          { copyId: "550e8400-e29b-41d4-a716-446655440099" }, // not owned
        ],
      }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ added: 1, updated: 0, skipped: 1 });
    expect(mockListsRepo.bulkCreateEntries).toHaveBeenCalled();
    const args = mockListsRepo.bulkCreateEntries.mock.calls[0] ?? [];
    expect(args[0]).toBe("copy");
    expect((args[1] as unknown[]) ?? []).toHaveLength(1);
    // Trade list → only the user's own copies are eligible.
    expect(mockCopiesRepo.filterAccessibleByViewer).toHaveBeenCalledWith(
      [COPY_ID, "550e8400-e29b-41d4-a716-446655440099"],
      USER_ID,
      true,
    );
  });

  it("allows shared group copies on an organize-copy list (personalOnly=false)", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({
      id: LIST_ID,
      kind: "copy",
      intent: "organize",
    });
    mockCopiesRepo.filterAccessibleByViewer.mockResolvedValue([COPY_ID]);
    mockListsRepo.bulkCreateEntries.mockResolvedValue({ inserted: 1, updated: 0 });

    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries: [{ copyId: COPY_ID }] }),
    });
    expect(res.status).toBe(200);
    expect(mockCopiesRepo.filterAccessibleByViewer).toHaveBeenCalledWith([COPY_ID], USER_ID, false);
  });

  it("surfaces updated count when the repo merges quantities", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "card", intent: "wish" });
    mockListsRepo.bulkCreateEntries.mockResolvedValue({ inserted: 1, updated: 2 });

    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [{ cardId: CARD_ID }, { cardId: CARD_ID }, { cardId: CARD_ID }],
      }),
    });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ added: 1, updated: 2, skipped: 0 });
  });

  it("rejects bulk add when any entry doesn't match the list's kind", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "card", intent: "wish" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [{ cardId: CARD_ID }, { copyId: COPY_ID }],
      }),
    });
    expect(res.status).toBe(400);
    expect(mockListsRepo.bulkCreateEntries).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/lists/:id/entries/from-copies", () => {
  beforeEach(() => {
    mockListsRepo.getIdKindIntent.mockReset();
    mockListsRepo.bulkCreateEntriesFromCopies.mockReset();
  });

  it("dispatches to the repo with the list's kind", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue({ id: LIST_ID, kind: "card", intent: "wish" });
    mockListsRepo.bulkCreateEntriesFromCopies.mockResolvedValue({
      added: 2,
      updated: 1,
      skipped: 1,
    });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/from-copies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyIds: [COPY_ID] }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ added: 2, updated: 1, skipped: 1 });
    // Wish list → personalOnly=true.
    expect(mockListsRepo.bulkCreateEntriesFromCopies).toHaveBeenCalledWith(
      LIST_ID,
      "card",
      USER_ID,
      [COPY_ID],
      true,
    );
  });

  it("returns 404 when the list does not exist for the user", async () => {
    mockListsRepo.getIdKindIntent.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/from-copies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyIds: [COPY_ID] }),
    });
    expect(res.status).toBe(404);
    expect(mockListsRepo.bulkCreateEntriesFromCopies).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/lists/:id/entries/:itemId", () => {
  beforeEach(() => {
    mockListsRepo.updateEntry.mockReset();
  });

  it("returns 200 with the updated entry", async () => {
    mockListsRepo.updateEntry.mockResolvedValue({ ...dbEntry, quantity: 5 });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/${ENTRY_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: 5 }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.quantity).toBe(5);
  });

  it("returns 404 when entry not found", async () => {
    mockListsRepo.updateEntry.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/${ENTRY_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantity: 5 }),
    });
    expect(res.status).toBe(404);
  });

  it("accepts a tradeOverride-only patch (ADR-017)", async () => {
    mockListsRepo.updateEntry.mockResolvedValue(dbEntry);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/${ENTRY_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tradeOverride: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
      }),
    });
    expect(res.status).toBe(200);
    expect(mockListsRepo.updateEntry).toHaveBeenCalledWith(ENTRY_ID, LIST_ID, USER_ID, {
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
    });
  });

  it("rejects a completely empty patch with 400", async () => {
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/${ENTRY_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(mockListsRepo.updateEntry).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/lists/:id/entries/:itemId", () => {
  beforeEach(() => {
    mockListsRepo.deleteEntry.mockReset();
  });

  it("returns 204 on success", async () => {
    mockListsRepo.deleteEntry.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/${ENTRY_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("returns 404 when not found", async () => {
    mockListsRepo.deleteEntry.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/${ENTRY_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/lists/:id/share", () => {
  beforeEach(() => {
    mockListsRepo.setShareToken.mockReset();
    mockListsRepo.getShareState.mockReset();
  });

  it("mints a fresh share token + isPublic=true when not yet shared", async () => {
    mockListsRepo.getShareState.mockResolvedValue({ shareToken: null, isPublic: false });
    mockListsRepo.setShareToken.mockResolvedValue({
      ...dbList,
      isPublic: true,
      shareToken: "stub",
    });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`, { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.isPublic).toBe(true);
    expect(typeof json.shareToken).toBe("string");
    expect(mockListsRepo.setShareToken).toHaveBeenCalled();
    const args = mockListsRepo.setShareToken.mock.calls[0] ?? [];
    expect(args[0]).toBe(LIST_ID);
    expect(args[1]).toBe(USER_ID);
    expect(typeof args[2]).toBe("string");
    expect(args[3]).toBe(true);
  });

  it("is idempotent: returns the existing token without re-minting", async () => {
    mockListsRepo.getShareState.mockResolvedValue({ shareToken: "existing", isPublic: true });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`, { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.shareToken).toBe("existing");
    expect(json.isPublic).toBe(true);
    expect(mockListsRepo.setShareToken).not.toHaveBeenCalled();
  });

  it("returns 404 when not owned", async () => {
    mockListsRepo.getShareState.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/lists/:id/share", () => {
  beforeEach(() => {
    mockListsRepo.getShareState.mockReset();
  });

  it("reflects unshared state without 404", async () => {
    mockListsRepo.getShareState.mockResolvedValue({ shareToken: null, isPublic: false });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ shareToken: null, isPublic: false });
  });

  it("reflects shared state", async () => {
    mockListsRepo.getShareState.mockResolvedValue({ shareToken: "tok", isPublic: true });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ shareToken: "tok", isPublic: true });
  });

  it("returns 404 when not owned", async () => {
    mockListsRepo.getShareState.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/lists/:id/share/rotate", () => {
  beforeEach(() => {
    mockListsRepo.setShareToken.mockReset();
  });

  it("mints a new token + isPublic=true", async () => {
    mockListsRepo.setShareToken.mockResolvedValue({ ...dbList, isPublic: true, shareToken: "new" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share/rotate`, { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(typeof json.shareToken).toBe("string");
    expect(json.isPublic).toBe(true);
    const args = mockListsRepo.setShareToken.mock.calls[0] ?? [];
    expect(args[3]).toBe(true);
  });

  it("returns 404 when not owned", async () => {
    mockListsRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share/rotate`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/lists/:id/share", () => {
  beforeEach(() => {
    mockListsRepo.setShareToken.mockReset();
  });

  it("returns 204 and nulls the token / isPublic", async () => {
    mockListsRepo.setShareToken.mockResolvedValue(dbList);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(mockListsRepo.setShareToken).toHaveBeenCalledWith(LIST_ID, USER_ID, null, false);
  });

  it("returns 404 when not owned", async () => {
    mockListsRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/lists/reorder", () => {
  beforeEach(() => {
    mockListsRepo.reorder.mockReset();
    mockListsRepo.reorder.mockResolvedValue(undefined);
  });

  it("returns 204 and forwards (intent, orderedIds) to the repo", async () => {
    const orderedIds = [
      "a0000000-0001-4000-a000-000000000010",
      "a0000000-0001-4000-a000-000000000011",
    ];
    const res = await app.request("/api/v1/lists/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "wish", orderedIds }),
    });
    expect(res.status).toBe(204);
    expect(mockListsRepo.reorder).toHaveBeenCalledWith(USER_ID, "wish", orderedIds);
  });

  it("returns 400 when intent is missing", async () => {
    const res = await app.request("/api/v1/lists/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: ["a0000000-0001-4000-a000-000000000010"] }),
    });
    expect(res.status).toBe(400);
    expect(mockListsRepo.reorder).not.toHaveBeenCalled();
  });

  it("returns 400 when orderedIds is empty", async () => {
    const res = await app.request("/api/v1/lists/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "trade", orderedIds: [] }),
    });
    expect(res.status).toBe(400);
  });
});
