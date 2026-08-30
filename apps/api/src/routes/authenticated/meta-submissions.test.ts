import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { metaSubmissionsRouter, mountMetaSubmissionsMiddleware } from "./meta-submissions";

// ---------------------------------------------------------------------------
// Mock repos and services
// ---------------------------------------------------------------------------

const mockSubmissions = { listByUser: vi.fn() };
const mockMeta = { creditVisibility: vi.fn(), setCreditVisibility: vi.fn() };
const mockSubmitMetaDeck = vi.fn();
const mockSubmitMetaEventCorrection = vi.fn();

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const EVENT_ID = "b0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { metaSubmissions: mockSubmissions, meta: mockMeta } as never);
  c.set("services", {
    submitMetaDeck: mockSubmitMetaDeck,
    submitMetaEventCorrection: mockSubmitMetaEventCorrection,
  } as never);
  c.set("transact", vi.fn() as never);
  await next();
});
registerRouterForTest(app, metaSubmissionsRouter);

/** @returns A valid submission body against an existing event. */
function submissionBody(overrides: Record<string, unknown> = {}) {
  return {
    metaEventId: EVENT_ID,
    playerName: "Renata",
    rank: 2,
    wins: 4,
    losses: 2,
    draws: 0,
    cards: [
      { name: "Azir", zone: "legend", quantity: 1 },
      { name: "Shock", zone: "main", quantity: 3 },
    ],
    note: "Copied from the stream overlay.",
    ...overrides,
  };
}

/** @returns The response to a submission POST. */
function submit(body: unknown) {
  return app.request("/api/v1/meta/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** @returns A stored ledger row. */
function ledgerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c0000000-0001-4000-a000-000000000001",
    userId: USER_ID,
    provider: "usersubmission",
    externalId: "2026-08-18--user--abcd1234",
    candidateMetaPlayerId: "d0000000-0001-4000-a000-000000000001",
    metaEventId: EVENT_ID,
    eventName: "Summoner Skirmish",
    playerName: "Renata",
    kind: "new_list",
    fieldEdits: null,
    note: null,
    status: "pending",
    resolutionReason: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedByUserId: null,
    acceptedDeckId: null,
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /meta/submissions", () => {
  it("stages a submission and reports the names that matched nothing", async () => {
    mockSubmitMetaDeck.mockResolvedValue({
      status: "ok",
      submissionId: "sub-1",
      candidatePlayerId: "cand-1",
      unresolvedNames: ["Shock"],
    });

    const res = await submit(submissionBody());

    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ id: "sub-1", unresolvedNames: ["Shock"] });
    expect(mockSubmitMetaDeck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: USER_ID,
        metaEventId: EVENT_ID,
        proposedEvent: null,
        playerName: "Renata",
        rank: 2,
        rankIsTier: false,
        wins: 4,
        losses: 2,
        draws: 0,
        listStatus: "full",
      }),
    );
  });

  it("carries a tier rank through as one", async () => {
    mockSubmitMetaDeck.mockResolvedValue({
      status: "ok",
      submissionId: "sub-3",
      candidatePlayerId: "cand-3",
      unresolvedNames: [],
    });

    await submit(submissionBody({ rank: 8, rankIsTier: true }));

    expect(mockSubmitMetaDeck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ rank: 8, rankIsTier: true }),
    );
  });

  it("rejects a submission claiming it carries no list", async () => {
    // A submission is a decklist; standings-only rows come from the archive's
    // own sources.
    const res = await submit(submissionBody({ listStatus: "none" }));

    expect(res.status).toBe(400);
    expect(mockSubmitMetaDeck).not.toHaveBeenCalled();
  });

  it("passes a proposed event through when the archive has no target", async () => {
    mockSubmitMetaDeck.mockResolvedValue({
      status: "ok",
      submissionId: "sub-2",
      candidatePlayerId: "cand-2",
      unresolvedNames: [],
    });

    const res = await submit(
      submissionBody({
        metaEventId: null,
        proposedEvent: {
          name: "Summoner Skirmish Berlin",
          eventDate: "2026-08-01",
          format: "constructed",
        },
      }),
    );

    expect(res.status).toBe(201);
    expect(mockSubmitMetaDeck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metaEventId: null,
        proposedEvent: expect.objectContaining({
          name: "Summoner Skirmish Berlin",
          playerCount: null,
          organizer: null,
          sourceUrl: null,
        }),
      }),
    );
  });

  it("rejects a body that targets both an existing and a proposed event", async () => {
    const res = await submit(
      submissionBody({
        proposedEvent: { name: "Skirmish", eventDate: "2026-08-01", format: "constructed" },
      }),
    );

    expect(res.status).toBe(400);
    expect(mockSubmitMetaDeck).not.toHaveBeenCalled();
  });

  it("rejects a body that targets neither", async () => {
    const res = await submit(submissionBody({ metaEventId: null }));

    expect(res.status).toBe(400);
    expect(mockSubmitMetaDeck).not.toHaveBeenCalled();
  });

  it("rejects an empty card list", async () => {
    const res = await submit(submissionBody({ cards: [] }));

    expect(res.status).toBe(400);
    expect(mockSubmitMetaDeck).not.toHaveBeenCalled();
  });

  it("turns the pending cap into a 429 naming the limit", async () => {
    mockSubmitMetaDeck.mockResolvedValue({ status: "rate_limited", limit: 10 });

    const res = await submit(submissionBody());

    expect(res.status).toBe(429);
    const json = await readJson(res);
    expect(json.message).toContain("10");
  });

  it("turns the service's validation problems into a 400 listing them", async () => {
    mockSubmitMetaDeck.mockResolvedValue({
      status: "invalid",
      errors: ["playerName must be 1-80 characters", "cards must not be empty"],
    });

    const res = await submit(submissionBody());

    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toContain("playerName must be 1-80 characters");
    expect(json.message).toContain("cards must not be empty");
  });
});

describe("GET /meta/submissions", () => {
  it("returns the caller's own submissions and no cursor on the last page", async () => {
    mockSubmissions.listByUser.mockResolvedValue([ledgerRow()]);

    const res = await app.request("/api/v1/meta/submissions");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].status).toBe("pending");
    expect(json.items[0].createdAt).toBe("2026-08-18T10:00:00.000Z");
    expect(json.nextCursor).toBeNull();
    // Always scoped to the session user; the client never supplies an id.
    expect(mockSubmissions.listByUser).toHaveBeenCalledWith(USER_ID, {
      cursor: null,
      limit: 25,
    });
  });

  it("hands back a cursor when the repo returned one row past the limit", async () => {
    mockSubmissions.listByUser.mockResolvedValue([
      ledgerRow(),
      ledgerRow({ id: "c0000000-0001-4000-a000-000000000002" }),
      ledgerRow({ id: "c0000000-0001-4000-a000-000000000003" }),
    ]);

    const res = await app.request("/api/v1/meta/submissions?limit=2");

    const json = await readJson(res);
    expect(json.items).toHaveLength(2);
    expect(json.nextCursor).toContain("2026-08-18T10:00:00.000Z");
  });

  it("carries a resolved submission's outcome", async () => {
    mockSubmissions.listByUser.mockResolvedValue([
      ledgerRow({
        status: "rejected",
        resolutionReason: "unverified",
        resolutionNote: "No source for this list.",
        resolvedAt: new Date("2026-08-19T09:00:00.000Z"),
      }),
    ]);

    const res = await app.request("/api/v1/meta/submissions");

    const json = await readJson(res);
    expect(json.items[0]).toEqual(
      expect.objectContaining({
        status: "rejected",
        resolutionReason: "unverified",
        resolutionNote: "No source for this list.",
        resolvedAt: "2026-08-19T09:00:00.000Z",
      }),
    );
  });
});

describe("credit visibility", () => {
  it("reads the caller's setting", async () => {
    mockMeta.creditVisibility.mockResolvedValue("riot_id");

    const res = await app.request("/api/v1/meta/credit-visibility");

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ visibility: "riot_id" });
    expect(mockMeta.creditVisibility).toHaveBeenCalledWith(USER_ID);
  });

  it("answers hidden when the row is gone", async () => {
    mockMeta.creditVisibility.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/meta/credit-visibility");

    expect(await readJson(res)).toEqual({ visibility: "hidden" });
  });

  it("writes a new setting and echoes it", async () => {
    mockMeta.setCreditVisibility.mockResolvedValue(true);

    const res = await app.request("/api/v1/meta/credit-visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: "name" }),
    });

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ visibility: "name" });
    expect(mockMeta.setCreditVisibility).toHaveBeenCalledWith(USER_ID, "name");
  });

  it("rejects a value outside the vocabulary", async () => {
    const res = await app.request("/api/v1/meta/credit-visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: "public" }),
    });

    expect(res.status).toBe(400);
    expect(mockMeta.setCreditVisibility).not.toHaveBeenCalled();
  });
});

describe("meta-submissions body limit", () => {
  // The limit is path middleware registered ahead of the oRPC catch-all
  // (app.ts), so it is mounted here on a bare app — an over-cap request never
  // reaches a router.
  const limited = new Hono<{ Variables: Variables }>();
  mountMetaSubmissionsMiddleware(limited);
  limited.post("/api/v1/meta/submissions", (c) => c.json({ ok: true }));

  /** @returns The response to a POST carrying a note of `noteLength` characters. */
  function post(noteLength: number) {
    return limited.request("/api/v1/meta/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "x".repeat(noteLength) }),
    });
  }

  it("rejects a payload over 128 KB with an envelope the oRPC client can parse", async () => {
    const res = await post(128 * 1024);

    expect(res.status).toBe(413);
    expect(await readJson(res)).toStrictEqual({
      defined: false,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      status: 413,
      message: "Submission exceeds 128 KB",
    });
  });

  it("lets an under-cap payload through", async () => {
    const res = await post(100);

    expect(res.status).toBe(200);
  });
});

describe("POST /meta/submissions/event-corrections", () => {
  /** @returns The response to a correction POST. */
  function correct(body: unknown) {
    return app.request("/api/v1/meta/submissions/event-corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("records the note and the proposed values", async () => {
    mockSubmitMetaEventCorrection.mockResolvedValue({ status: "ok", submissionId: "sub-9" });

    const res = await correct({
      metaEventId: EVENT_ID,
      fieldEdits: { playerCount: 48 },
      note: "The results page lists 48 players.",
    });

    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ id: "sub-9" });
    expect(mockSubmitMetaEventCorrection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: USER_ID,
        metaEventId: EVENT_ID,
        fieldEdits: { playerCount: 48 },
        note: "The results page lists 48 players.",
      }),
    );
  });

  it("defaults a correction with no field edits to an empty set", async () => {
    mockSubmitMetaEventCorrection.mockResolvedValue({ status: "ok", submissionId: "sub-10" });

    await correct({ metaEventId: EVENT_ID, note: "The winner's name is misspelled." });

    expect(mockSubmitMetaEventCorrection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fieldEdits: {} }),
    );
  });

  it("refuses a correction with nothing written in the note", async () => {
    const res = await correct({ metaEventId: EVENT_ID, fieldEdits: { playerCount: 48 } });

    expect(res.status).toBe(400);
    expect(mockSubmitMetaEventCorrection).not.toHaveBeenCalled();
  });

  it("turns the pending cap into a message the dialog can show", async () => {
    mockSubmitMetaEventCorrection.mockResolvedValue({ status: "rate_limited", limit: 10 });

    const res = await correct({ metaEventId: EVENT_ID, note: "Wrong date." });

    expect(res.status).toBe(429);
    const json = await readJson(res);
    expect(json.message).toContain("10 submissions");
  });
});
