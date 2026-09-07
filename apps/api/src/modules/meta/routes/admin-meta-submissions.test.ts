import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminMetaSubmissionsRouter } from "./admin-meta-submissions";

const mockSubmissions = {
  listPendingEventCorrections: vi.fn(),
  byId: vi.fn(),
  byPlayerOverlayId: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
};

const mockAdminEvents = { insert: vi.fn() };

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const SUBMISSION_ID = "b0000000-0001-4000-a000-000000000001";
const PLAYER_OVERLAY_ID = "c0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { metaSubmissions: mockSubmissions, adminEvents: mockAdminEvents } as never);
  await next();
});
registerRouterForTest(app, adminMetaSubmissionsRouter);

/** A stored ledger row, pending unless overridden. */
function ledgerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBMISSION_ID,
    userId: "user-7",
    provider: "usersubmission",
    externalId: "2026-08-18--user-7--abcd1234",
    playerOverlayId: PLAYER_OVERLAY_ID,
    metaEventId: "d0000000-0001-4000-a000-000000000001",
    eventName: "Summoner Skirmish",
    playerName: "Renata",
    kind: "new_list",
    fieldEdits: null,
    note: "Copied from the stream overlay.",
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

/** The response to a POST with an optional JSON body. */
function post(path: string, body?: unknown) {
  return app.request(`/api/admin/v1/meta/submissions${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /meta/submissions/by-player-overlay/{playerOverlayId}", () => {
  it("returns the ledger row behind a submitted deck", async () => {
    mockSubmissions.byPlayerOverlayId.mockResolvedValue(ledgerRow());

    const res = await app.request(
      `/api/admin/v1/meta/submissions/by-player-overlay/${PLAYER_OVERLAY_ID}`,
    );

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      submission: {
        id: SUBMISSION_ID,
        eventName: "Summoner Skirmish",
        playerName: "Renata",
        kind: "new_list",
        note: "Copied from the stream overlay.",
        status: "pending",
        reason: null,
        resolutionNote: null,
        acceptedDeckId: null,
        createdAt: "2026-08-18T10:00:00.000Z",
        resolvedAt: null,
      },
    });
  });

  it("answers null for a provider's overlay rather than 404ing", async () => {
    mockSubmissions.byPlayerOverlayId.mockResolvedValue(null);

    const res = await app.request(
      `/api/admin/v1/meta/submissions/by-player-overlay/${PLAYER_OVERLAY_ID}`,
    );

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ submission: null });
  });
});

describe("POST /meta/submissions/{id}/resolve", () => {
  it("stamps a rejection with its reason, note, and the acting admin", async () => {
    mockSubmissions.byId.mockResolvedValue(ledgerRow());

    const res = await post(`/${SUBMISSION_ID}/resolve`, {
      status: "rejected",
      reason: "unverified",
      note: "No source for this list.",
    });

    expect(res.status).toBe(204);
    expect(mockSubmissions.resolve).toHaveBeenCalledWith(SUBMISSION_ID, {
      status: "rejected",
      resolvedAt: expect.any(Date),
      reason: "unverified",
      note: "No source for this list.",
      resolvedByUserId: USER_ID,
      acceptedDeckId: null,
    });
  });

  it("settles a duplicate as already_correct, the ADR's expected second-submitter outcome", async () => {
    mockSubmissions.byId.mockResolvedValue(ledgerRow());

    const res = await post(`/${SUBMISSION_ID}/resolve`, {
      status: "already_correct",
      reason: "already_correct",
    });

    expect(res.status).toBe(204);
    expect(mockSubmissions.resolve).toHaveBeenCalledWith(
      SUBMISSION_ID,
      expect.objectContaining({ status: "already_correct", reason: "already_correct", note: null }),
    );
  });

  it("takes not_applied with no reason at all", async () => {
    mockSubmissions.byId.mockResolvedValue(ledgerRow());

    const res = await post(`/${SUBMISSION_ID}/resolve`, { status: "not_applied" });

    expect(res.status).toBe(204);
    expect(mockSubmissions.resolve).toHaveBeenCalledWith(
      SUBMISSION_ID,
      expect.objectContaining({ status: "not_applied", reason: null, note: null }),
    );
  });

  it("records the outcome in the admin audit log", async () => {
    mockSubmissions.byId.mockResolvedValue(ledgerRow());

    await post(`/${SUBMISSION_ID}/resolve`, { status: "rejected", reason: "duplicate" });

    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: USER_ID,
        action: "meta-submission.resolve",
        entityType: "meta-submission",
        entityId: SUBMISSION_ID,
        entityLabel: "Renata — Summoner Skirmish",
        oldValues: { status: "pending" },
        newValues: { status: "rejected", reason: "duplicate" },
      }),
    );
  });

  it("refuses `accepted`, which only an accept may write", async () => {
    const res = await post(`/${SUBMISSION_ID}/resolve`, { status: "accepted" });

    expect(res.status).toBe(400);
    expect(mockSubmissions.resolve).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an accepted submission", async () => {
    mockSubmissions.byId.mockResolvedValue(
      ledgerRow({
        status: "accepted",
        acceptedDeckId: "deck-1",
        resolvedAt: new Date("2026-08-19T09:00:00.000Z"),
      }),
    );

    const res = await post(`/${SUBMISSION_ID}/resolve`, { status: "rejected" });

    // The accept wrote a public credit and a live deck in the same transaction;
    // stamping "rejected" over it would leave the three disagreeing.
    expect(res.status).toBe(409);
    expect(mockSubmissions.resolve).not.toHaveBeenCalled();
  });

  it("404s an unknown submission", async () => {
    mockSubmissions.byId.mockResolvedValue(null);

    const res = await post(`/${SUBMISSION_ID}/resolve`, { status: "rejected" });

    expect(res.status).toBe(404);
    expect(mockSubmissions.resolve).not.toHaveBeenCalled();
  });
});

describe("POST /meta/submissions/{id}/reopen", () => {
  it("returns a rejected submission to the queue", async () => {
    mockSubmissions.byId.mockResolvedValue(
      ledgerRow({
        status: "rejected",
        resolutionReason: "unverified",
        resolvedAt: new Date("2026-08-19T09:00:00.000Z"),
      }),
    );

    const res = await post(`/${SUBMISSION_ID}/reopen`);

    expect(res.status).toBe(204);
    expect(mockSubmissions.reopen).toHaveBeenCalledWith(SUBMISSION_ID);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "meta-submission.reopen",
        oldValues: { status: "rejected" },
        newValues: { status: "pending" },
      }),
    );
  });

  it("refuses to reopen an accepted submission", async () => {
    mockSubmissions.byId.mockResolvedValue(ledgerRow({ status: "accepted" }));

    const res = await post(`/${SUBMISSION_ID}/reopen`);

    expect(res.status).toBe(409);
    expect(mockSubmissions.reopen).not.toHaveBeenCalled();
  });

  it("404s an unknown submission", async () => {
    mockSubmissions.byId.mockResolvedValue(null);

    const res = await post(`/${SUBMISSION_ID}/reopen`);

    expect(res.status).toBe(404);
    expect(mockSubmissions.reopen).not.toHaveBeenCalled();
  });
});

describe("GET /meta/submissions/event-corrections", () => {
  const event = {
    id: "d0000000-0001-4000-a000-000000000001",
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "freeform",
    playerCount: 64,
    organizer: "Rift Games Berlin",
    location: null,
    country: "DE",
  };

  it("pairs each proposed value with the event it would replace", async () => {
    mockSubmissions.listPendingEventCorrections.mockResolvedValue([
      {
        submission: ledgerRow({
          kind: "event_correction",
          playerName: null,
          playerOverlayId: null,
          fieldEdits: { playerCount: 48 },
        }),
        event,
      },
    ]);

    const res = await app.request("/api/admin/v1/meta/submissions/event-corrections");
    const json = await readJson(res);

    expect(res.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].fieldEdits).toEqual({ playerCount: 48 });
    expect(json.items[0].event.playerCount).toBe(64);
    expect(json.items[0].submission.playerName).toBeNull();
    expect(json.items[0].submission.kind).toBe("event_correction");
  });

  it("reads an absent edit set as no proposed values", async () => {
    mockSubmissions.listPendingEventCorrections.mockResolvedValue([
      {
        submission: ledgerRow({
          kind: "event_correction",
          playerName: null,
          playerOverlayId: null,
          fieldEdits: null,
        }),
        event: null,
      },
    ]);

    const json = await readJson(
      await app.request("/api/admin/v1/meta/submissions/event-corrections"),
    );

    expect(json.items[0].fieldEdits).toEqual({});
    expect(json.items[0].event).toBeNull();
  });

  it("answers an empty list when nothing is waiting", async () => {
    mockSubmissions.listPendingEventCorrections.mockResolvedValue([]);

    const json = await readJson(
      await app.request("/api/admin/v1/meta/submissions/event-corrections"),
    );

    expect(json.items).toEqual([]);
    expect(json.hasMore).toBe(false);
  });

  it("says the page was cut short rather than truncating in silence", async () => {
    const row = {
      submission: ledgerRow({
        kind: "event_correction",
        playerName: null,
        playerOverlayId: null,
        fieldEdits: {},
      }),
      event,
    };
    // The handler asks for one past the cap; the extra row is what tells it
    // there is more behind.
    mockSubmissions.listPendingEventCorrections.mockImplementation((limit: number) =>
      Promise.resolve(Array.from({ length: limit }, () => row)),
    );

    const json = await readJson(
      await app.request("/api/admin/v1/meta/submissions/event-corrections"),
    );

    expect(json.hasMore).toBe(true);
    expect(json.items).toHaveLength(200);
  });
});
