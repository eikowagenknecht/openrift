import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { tierListsRouter } from "./tier-lists";

const mockTierListsRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  create: vi.fn(() => Promise.resolve({} as object)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  remove: vi.fn(() => Promise.resolve(false)),
  getShareState: vi.fn(() =>
    Promise.resolve(undefined as { shareToken: string | null; isPublic: boolean } | undefined),
  ),
  setShare: vi.fn(() =>
    Promise.resolve(undefined as { shareToken: string | null; isPublic: boolean } | undefined),
  ),
  findByShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const LIST_ID = "70000000-0001-4000-a000-000000000001";
const CARD_ID = "c0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "d0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { tierLists: mockTierListsRepo } as never);
  await next();
});
registerRouterForTest(app, tierListsRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

const now = new Date("2026-08-14T00:00:00Z");

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LIST_ID,
    userId: USER_ID,
    title: "Origins — best commons",
    description: null,
    tiers: [{ label: "S", cards: [{ cardId: CARD_ID, printingId: null }] }],
    isPublic: false,
    shareToken: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** @returns The response body of a JSON request against the mounted router. */
async function request(path: string, init?: RequestInit) {
  // Spreading HeadersInit drops a Headers instance's entries and turns a
  // string[][] into indices, so build the headers rather than merging objects.
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await app.request(`/api/v1${path}`, { ...init, headers });
  return { status: res.status, body: res.status === 204 ? null : await readJson(res) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /tier-lists", () => {
  it("returns the caller's lists as summaries", async () => {
    mockTierListsRepo.listForUser.mockResolvedValue([dbRow()]);

    const { status, body } = await request("/tier-lists");

    expect(status).toBe(200);
    expect(mockTierListsRepo.listForUser).toHaveBeenCalledWith(USER_ID);
    expect(body).toMatchObject({
      items: [
        {
          id: LIST_ID,
          cardCount: 1,
          tierCount: 1,
          previewRows: [
            { rowIndex: 0, label: "S", cards: [{ cardId: CARD_ID, printingId: null }] },
          ],
        },
      ],
    });
  });

  it("does not ship the full board on the index", async () => {
    mockTierListsRepo.listForUser.mockResolvedValue([dbRow()]);

    const { body } = await request("/tier-lists");

    expect((body as { items: object[] }).items[0]).not.toHaveProperty("tiers");
  });
});

describe("GET /tier-lists/{id}", () => {
  it("404s for a list the caller does not own", async () => {
    mockTierListsRepo.getByIdForUser.mockResolvedValue(undefined);

    const { status, body } = await request(`/tier-lists/${LIST_ID}`);

    expect(status).toBe(404);
    expect(body).toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the full board for the owner", async () => {
    mockTierListsRepo.getByIdForUser.mockResolvedValue(dbRow());

    const { status, body } = await request(`/tier-lists/${LIST_ID}`);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      tiers: [{ label: "S", cards: [{ cardId: CARD_ID, printingId: null }] }],
    });
    expect(mockTierListsRepo.getByIdForUser).toHaveBeenCalledWith(LIST_ID, USER_ID);
  });
});

describe("POST /tier-lists", () => {
  it("starts a new list on the default S/A/B/C/D board", async () => {
    mockTierListsRepo.create.mockResolvedValue(dbRow());

    await request("/tier-lists", {
      method: "POST",
      body: JSON.stringify({ title: "Origins" }),
    });

    expect(mockTierListsRepo.create).toHaveBeenCalledWith(USER_ID, {
      title: "Origins",
      description: null,
      tiers: [
        { label: "S", cards: [] },
        { label: "A", cards: [] },
        { label: "B", cards: [] },
        { label: "C", cards: [] },
        { label: "D", cards: [] },
      ],
    });
  });

  it("trims the title and stores a blank description as null", async () => {
    mockTierListsRepo.create.mockResolvedValue(dbRow());

    await request("/tier-lists", {
      method: "POST",
      body: JSON.stringify({ title: "  Origins  ", description: "   " }),
    });

    expect(mockTierListsRepo.create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ title: "Origins", description: null }),
    );
  });

  it("rejects a board with the same card in two tiers", async () => {
    const { status } = await request("/tier-lists", {
      method: "POST",
      body: JSON.stringify({
        title: "Origins",
        tiers: [
          { label: "S", cards: [{ cardId: CARD_ID }] },
          { label: "A", cards: [{ cardId: CARD_ID }] },
        ],
      }),
    });

    expect(status).toBe(400);
    expect(mockTierListsRepo.create).not.toHaveBeenCalled();
  });

  it("rejects a blank title", async () => {
    const { status } = await request("/tier-lists", {
      method: "POST",
      body: JSON.stringify({ title: "" }),
    });

    expect(status).toBe(400);
  });

  it("rejects a whitespace-only title as a validation error, not a DB error", async () => {
    // Regression: the contract used to validate before trimming, so "   "
    // passed min(1), trimmed to "", and hit the DB's not-empty check as a 500.
    const { status } = await request("/tier-lists", {
      method: "POST",
      body: JSON.stringify({ title: "   " }),
    });

    expect(status).toBe(400);
    expect(mockTierListsRepo.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /tier-lists/{id}", () => {
  it("writes only the fields the caller sent", async () => {
    mockTierListsRepo.update.mockResolvedValue(dbRow());

    await request(`/tier-lists/${LIST_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        tiers: [{ label: "S", cards: [{ cardId: CARD_ID, printingId: PRINTING_ID }] }],
      }),
    });

    // Notably no `title` key: an undefined one would reach Kysely's SET clause
    // and null the column.
    expect(mockTierListsRepo.update).toHaveBeenCalledWith(LIST_ID, USER_ID, {
      tiers: [{ label: "S", cards: [{ cardId: CARD_ID, printingId: PRINTING_ID }] }],
    });
  });

  it("stores an entry with no printing as an explicit null", async () => {
    // The column holds what the contract parsed, so an omitted printing has to
    // arrive at the repo already filled in rather than as a missing key.
    mockTierListsRepo.update.mockResolvedValue(dbRow());

    await request(`/tier-lists/${LIST_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ tiers: [{ label: "S", cards: [{ cardId: CARD_ID }] }] }),
    });

    expect(mockTierListsRepo.update).toHaveBeenCalledWith(LIST_ID, USER_ID, {
      tiers: [{ label: "S", cards: [{ cardId: CARD_ID, printingId: null }] }],
    });
  });

  it("trims row labels on the way in", async () => {
    mockTierListsRepo.update.mockResolvedValue(dbRow());

    await request(`/tier-lists/${LIST_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ tiers: [{ label: "  S  ", cards: [] }] }),
    });

    expect(mockTierListsRepo.update).toHaveBeenCalledWith(LIST_ID, USER_ID, {
      tiers: [{ label: "S", cards: [] }],
    });
  });

  it("rejects a whitespace-only row label", async () => {
    const { status } = await request(`/tier-lists/${LIST_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ tiers: [{ label: "   ", cards: [] }] }),
    });

    expect(status).toBe(400);
    expect(mockTierListsRepo.update).not.toHaveBeenCalled();
  });

  it("returns the current state without writing when nothing was sent", async () => {
    mockTierListsRepo.getByIdForUser.mockResolvedValue(dbRow());

    const { status } = await request(`/tier-lists/${LIST_ID}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    expect(status).toBe(200);
    expect(mockTierListsRepo.update).not.toHaveBeenCalled();
    expect(mockTierListsRepo.getByIdForUser).toHaveBeenCalledWith(LIST_ID, USER_ID);
  });

  it("404s for a list the caller does not own", async () => {
    mockTierListsRepo.update.mockResolvedValue(undefined);

    const { status } = await request(`/tier-lists/${LIST_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed" }),
    });

    expect(status).toBe(404);
  });
});

describe("DELETE /tier-lists/{id}", () => {
  it("204s when a list was deleted", async () => {
    mockTierListsRepo.remove.mockResolvedValue(true);

    const { status } = await request(`/tier-lists/${LIST_ID}`, { method: "DELETE" });

    expect(status).toBe(204);
    expect(mockTierListsRepo.remove).toHaveBeenCalledWith(LIST_ID, USER_ID);
  });

  it("404s when nothing was deleted", async () => {
    mockTierListsRepo.remove.mockResolvedValue(false);

    const { status } = await request(`/tier-lists/${LIST_ID}`, { method: "DELETE" });

    expect(status).toBe(404);
  });
});

describe("sharing", () => {
  it("mints a token the first time a list is shared", async () => {
    mockTierListsRepo.getShareState.mockResolvedValue({ shareToken: null, isPublic: false });
    mockTierListsRepo.setShare.mockResolvedValue({ shareToken: "token", isPublic: true });

    const { status, body } = await request(`/tier-lists/${LIST_ID}/share`, { method: "POST" });

    expect(status).toBe(200);
    expect(body).toMatchObject({ isPublic: true });
    expect((body as { shareToken: string }).shareToken).toHaveLength(12);
  });

  it("keeps the existing link when a shared list is shared again", async () => {
    mockTierListsRepo.getShareState.mockResolvedValue({ shareToken: "existing", isPublic: true });

    const { body } = await request(`/tier-lists/${LIST_ID}/share`, { method: "POST" });

    expect(body).toEqual({ shareToken: "existing", isPublic: true });
    // Re-sharing must not rotate the token: a creator may already have pasted
    // it into a video description.
    expect(mockTierListsRepo.setShare).not.toHaveBeenCalled();
  });

  it("re-mints when a list has a stale token but is no longer public", async () => {
    mockTierListsRepo.getShareState.mockResolvedValue({ shareToken: "stale", isPublic: false });
    mockTierListsRepo.setShare.mockResolvedValue({ shareToken: "fresh", isPublic: true });

    const { body } = await request(`/tier-lists/${LIST_ID}/share`, { method: "POST" });

    expect((body as { shareToken: string }).shareToken).not.toBe("stale");
    expect(mockTierListsRepo.setShare).toHaveBeenCalled();
  });

  it("clears the token as well as the flag when sharing stops", async () => {
    mockTierListsRepo.setShare.mockResolvedValue({ shareToken: null, isPublic: false });

    const { status } = await request(`/tier-lists/${LIST_ID}/share`, { method: "DELETE" });

    expect(status).toBe(204);
    expect(mockTierListsRepo.setShare).toHaveBeenCalledWith(LIST_ID, USER_ID, null, false);
  });

  it("404s when unsharing a list the caller does not own", async () => {
    mockTierListsRepo.setShare.mockResolvedValue(undefined);

    const { status } = await request(`/tier-lists/${LIST_ID}/share`, { method: "DELETE" });

    expect(status).toBe(404);
  });
});
