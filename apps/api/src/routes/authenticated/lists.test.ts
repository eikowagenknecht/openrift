import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { listsRoute } from "./lists";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockListsRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  getIdAndKind: vi.fn(() => Promise.resolve(undefined as { id: string; kind: string } | undefined)),
  create: vi.fn(() => Promise.resolve({} as object)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteByIdForUser: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
  setShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  findByShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  entriesWithDetails: vi.fn(() => Promise.resolve([] as object[])),
  entriesWithDetailsAnon: vi.fn(() => Promise.resolve([] as object[])),
  createEntry: vi.fn(() => Promise.resolve({} as object)),
  bulkCreateEntries: vi.fn(() => Promise.resolve({ inserted: 0, updated: 0 })),
  bulkCreateEntriesFromCopies: vi.fn(() => Promise.resolve({ added: 0, updated: 0, skipped: 0 })),
  updateEntry: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteEntry: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
};

const mockCopiesRepo = {
  existsForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  filterUserOwned: vi.fn(() => Promise.resolve([] as string[])),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const LIST_ID = "a0000000-0001-4000-a000-000000000010";
const ENTRY_ID = "a0000000-0001-4000-a000-000000000020";
const CARD_ID = "c0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "d0000000-0001-4000-a000-000000000001";
const COPY_ID = "550e8400-e29b-41d4-a716-446655440000";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", {
      lists: mockListsRepo,
      copies: mockCopiesRepo,
    } as never);
    await next();
  })
  .route("/api/v1", listsRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const now = new Date("2026-05-17T00:00:00Z");

const dbList = {
  id: LIST_ID,
  userId: USER_ID,
  name: "Wants",
  intent: "wish" as const,
  kind: "card" as const,
  isPublic: false,
  shareToken: null,
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

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

describe("GET /api/v1/lists", () => {
  beforeEach(() => {
    mockListsRepo.listForUser.mockReset();
  });

  it("returns 200 with all lists for the user, surfacing entry count", async () => {
    mockListsRepo.listForUser.mockResolvedValue([{ ...dbList, entryCount: 7 }]);
    const res = await app.request("/api/v1/lists");
    expect(res.status).toBe(200);
    const json = await res.json();
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

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

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
    });
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

// ---------------------------------------------------------------------------
// GET ONE
// ---------------------------------------------------------------------------

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
        cardId: CARD_ID,
        printingId: null,
        copyId: null,
        quantity: 2,
        cardName: "Fire Dragon",
        cardType: "unit",
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
    const json = await res.json();
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

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

describe("PATCH /api/v1/lists/:id", () => {
  beforeEach(() => {
    mockListsRepo.update.mockReset();
  });

  it("returns 200 with the updated list", async () => {
    mockListsRepo.update.mockResolvedValue({ ...dbList, name: "Renamed" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
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
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ENTRIES — CREATE
// ---------------------------------------------------------------------------

describe("POST /api/v1/lists/:id/entries", () => {
  beforeEach(() => {
    mockListsRepo.getIdAndKind.mockReset();
    mockListsRepo.createEntry.mockReset();
    mockCopiesRepo.existsForUser.mockReset();
  });

  it("returns 201 for a card-kind list with cardId", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "card" });
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
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "card" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ printingId: PRINTING_ID }),
    });
    expect(res.status).toBe(400);
    expect(mockListsRepo.createEntry).not.toHaveBeenCalled();
  });

  it("validates copy ownership for copy-kind lists", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "copy" });
    mockCopiesRepo.existsForUser.mockResolvedValue({ id: COPY_ID });
    mockListsRepo.createEntry.mockResolvedValue(dbCopyEntry);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyId: COPY_ID }),
    });
    expect(res.status).toBe(201);
    expect(mockCopiesRepo.existsForUser).toHaveBeenCalledWith(COPY_ID, USER_ID);
  });

  it("returns 404 when copy is not owned", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "copy" });
    mockCopiesRepo.existsForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyId: COPY_ID }),
    });
    expect(res.status).toBe(404);
    expect(mockListsRepo.createEntry).not.toHaveBeenCalled();
  });

  it("returns 404 when the list doesn't exist for the user", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: CARD_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an entry with no target", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "card" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an entry with two targets", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "card" });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: CARD_ID, printingId: PRINTING_ID }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// ENTRIES — BULK
// ---------------------------------------------------------------------------

describe("POST /api/v1/lists/:id/entries/bulk", () => {
  beforeEach(() => {
    mockListsRepo.getIdAndKind.mockReset();
    mockListsRepo.bulkCreateEntries.mockReset();
    mockCopiesRepo.filterUserOwned.mockReset();
  });

  it("filters non-owned copies (copy-kind list)", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "copy" });
    mockCopiesRepo.filterUserOwned.mockResolvedValue([COPY_ID]);
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
    const json = await res.json();
    expect(json).toEqual({ added: 1, updated: 0, skipped: 1 });
    // bulkCreateEntries receives kind + only the owned entry.
    expect(mockListsRepo.bulkCreateEntries).toHaveBeenCalled();
    const args = mockListsRepo.bulkCreateEntries.mock.calls[0] ?? [];
    expect(args[0]).toBe("copy");
    expect((args[1] as unknown[]) ?? []).toHaveLength(1);
  });

  it("surfaces updated count when the repo merges quantities", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "card" });
    mockListsRepo.bulkCreateEntries.mockResolvedValue({ inserted: 1, updated: 2 });

    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [{ cardId: CARD_ID }, { cardId: CARD_ID }, { cardId: CARD_ID }],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ added: 1, updated: 2, skipped: 0 });
  });

  it("rejects bulk add when any entry doesn't match the list's kind", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "card" });
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

// ---------------------------------------------------------------------------
// ENTRIES — FROM COPIES (drag-from-collections endpoint)
// ---------------------------------------------------------------------------

describe("POST /api/v1/lists/:id/entries/from-copies", () => {
  beforeEach(() => {
    mockListsRepo.getIdAndKind.mockReset();
    mockListsRepo.bulkCreateEntriesFromCopies.mockReset();
  });

  it("dispatches to the repo with the list's kind", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue({ id: LIST_ID, kind: "card" });
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
    const json = await res.json();
    expect(json).toEqual({ added: 2, updated: 1, skipped: 1 });
    expect(mockListsRepo.bulkCreateEntriesFromCopies).toHaveBeenCalledWith(
      LIST_ID,
      "card",
      USER_ID,
      [COPY_ID],
    );
  });

  it("returns 404 when the list does not exist for the user", async () => {
    mockListsRepo.getIdAndKind.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/entries/from-copies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ copyIds: [COPY_ID] }),
    });
    expect(res.status).toBe(404);
    expect(mockListsRepo.bulkCreateEntriesFromCopies).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ENTRIES — PATCH / DELETE
// ---------------------------------------------------------------------------

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
    const json = await res.json();
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

// ---------------------------------------------------------------------------
// SHARE / UNSHARE
// ---------------------------------------------------------------------------

describe("POST /api/v1/lists/:id/share", () => {
  beforeEach(() => {
    mockListsRepo.setShareToken.mockReset();
  });

  it("returns a fresh share token + isPublic=true", async () => {
    mockListsRepo.setShareToken.mockResolvedValue({
      ...dbList,
      isPublic: true,
      shareToken: "stub",
    });
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`, { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isPublic).toBe(true);
    expect(typeof json.shareToken).toBe("string");
    expect(mockListsRepo.setShareToken).toHaveBeenCalled();
    const args = mockListsRepo.setShareToken.mock.calls[0] ?? [];
    expect(args[0]).toBe(LIST_ID);
    expect(args[1]).toBe(USER_ID);
    expect(typeof args[2]).toBe("string");
    expect(args[3]).toBe(true);
  });

  it("returns 404 when not owned", async () => {
    mockListsRepo.setShareToken.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/lists/${LIST_ID}/share`, { method: "POST" });
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
