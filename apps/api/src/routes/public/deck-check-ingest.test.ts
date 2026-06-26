import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { deckCheckIngestRouter } from "./deck-check-ingest";

// Mock the ingest service so the handler (auth + validation + result wiring) is
// exercised without a database.
const mockIngest = vi.fn();
vi.mock("../../services/deck-check-ingest.js", () => ({
  ingestDeckCheckPush: (...args: unknown[]) => mockIngest(...args),
}));

const mockDeckCheckRepo = {
  findActiveKeyByHash: vi.fn(),
  touchKeyUsage: vi.fn(),
};

// Mount the oRPC router the way production does (single catch-all +
// appErrorInterceptor + buildApiContext), so the native `{ code, message }`
// error envelope and the `context.reqHeader` Bearer-key auth are exercised end
// to end. The rate limit / body limit are app-level Hono middleware (app.ts),
// not part of the router, so they're out of scope here.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { deckCheck: mockDeckCheckRepo } as never);
  c.set("config", { appBaseUrl: "https://openrift.test" } as never);
  c.set("transact", (async (run: (repos: unknown) => unknown) =>
    run({ deckCheck: mockDeckCheckRepo })) as never);
  await next();
});
registerRouterForTest(app, deckCheckIngestRouter);

const EVENT_ID = "a0000000-0001-4000-a000-000000000001";

// A full, schema-valid result — oRPC now validates the handler's output, so the
// mocked service must return the real `DeckCheckIngestResultResponse` shape.
const RESULT = {
  eventId: EVENT_ID,
  entriesCreated: 0,
  entriesUpdated: 0,
  entriesUnchanged: 0,
  entriesWithdrawn: 0,
  checksInvalidated: 0,
  entriesIgnored: 0,
  entries: [],
};

function push(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/v1/ingest/deck-check", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/ingest/deck-check (oRPC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the ingest result for a valid key + payload", async () => {
    mockDeckCheckRepo.findActiveKeyByHash.mockResolvedValue({ id: "key-1", groupId: "grp-1" });
    mockIngest.mockResolvedValue(RESULT);

    const res = await push({ eventId: EVENT_ID, entries: [] }, { Authorization: "Bearer secret" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(mockIngest).toHaveBeenCalledWith(
      expect.anything(),
      "grp-1",
      { eventId: EVENT_ID, entries: [] },
      "https://openrift.test",
    );
    expect(mockDeckCheckRepo.touchKeyUsage).toHaveBeenCalledWith("key-1");
  });

  it("returns 401 { code, message } when the Authorization header is missing", async () => {
    const res = await push({ eventId: EVENT_ID, entries: [] });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Missing push key",
    });
    expect(mockDeckCheckRepo.findActiveKeyByHash).not.toHaveBeenCalled();
  });

  it("returns 401 { code, message } when the key is unknown or revoked", async () => {
    mockDeckCheckRepo.findActiveKeyByHash.mockResolvedValue(undefined);
    const res = await push({ eventId: EVENT_ID, entries: [] }, { Authorization: "Bearer nope" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Unknown or revoked push key",
    });
  });

  it("returns 400 on a bad body, before the auth check (oRPC input validation)", async () => {
    const res = await push({ eventId: "not-a-uuid" }, { Authorization: "Bearer secret" });
    expect(res.status).toBe(400);
    // Validation runs before the handler, so the key is never looked up — this
    // preserves the previous validation-first ordering.
    expect(mockDeckCheckRepo.findActiveKeyByHash).not.toHaveBeenCalled();
  });
});
