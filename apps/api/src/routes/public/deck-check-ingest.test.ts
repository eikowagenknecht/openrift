import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { deckCheckIngestRouter, mountDeckCheckIngestMiddleware } from "./deck-check-ingest";

// Mock the ingest service so the handler (auth + validation + result wiring) is
// exercised without a database.
const mockIngest = vi.fn();
vi.mock("../../services/deck-check-ingest.js", () => ({
  ingestDeckCheckPush: (...args: unknown[]) => mockIngest(...args),
}));

const mockDeckCheckKeysRepo = {
  findActiveKeyByHash: vi.fn(),
  touchKeyUsage: vi.fn(),
};

// Mount the oRPC router the way production does (single catch-all +
// appErrorInterceptor + buildApiContext), so the native `{ code, message }`
// error envelope and the `context.reqHeader` Bearer-key auth are exercised end
// to end. The rate limit / body limit are app-level Hono middleware (app.ts),
// not part of the router, so they get their own app in the last describe.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { deckCheckKeys: mockDeckCheckKeysRepo } as never);
  c.set("config", { appBaseUrl: "https://openrift.test" } as never);
  c.set("transact", (async (run: (repos: unknown) => unknown) =>
    run({ deckCheckKeys: mockDeckCheckKeysRepo })) as never);
  await next();
});
registerRouterForTest(app, deckCheckIngestRouter);

const EVENT_ID = "a0000000-0001-4000-a000-000000000001";

// A full, schema-valid result — oRPC now validates the handler's output, so the
// mocked service must return the real `DeckCheckIngestResultResponse` shape.
const RESULT = {
  tournamentId: EVENT_ID,
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
    mockDeckCheckKeysRepo.findActiveKeyByHash.mockResolvedValue({
      id: "key-1",
      hostType: "user",
      hostUserId: "user-1",
      hostOrgId: null,
    });
    mockIngest.mockResolvedValue(RESULT);

    const res = await push(
      { tournamentId: EVENT_ID, entries: [] },
      { Authorization: "Bearer secret" },
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual(RESULT);
    expect(mockIngest).toHaveBeenCalledWith(
      expect.anything(),
      { hostType: "user", hostUserId: "user-1", hostOrgId: null },
      { tournamentId: EVENT_ID, entries: [] },
      "https://openrift.test",
    );
    expect(mockDeckCheckKeysRepo.touchKeyUsage).toHaveBeenCalledWith("key-1");
  });

  it("returns 401 { code, message } when the Authorization header is missing", async () => {
    const res = await push({ tournamentId: EVENT_ID, entries: [] });
    expect(res.status).toBe(401);
    expect(await readJson(res)).toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Missing push key",
    });
    expect(mockDeckCheckKeysRepo.findActiveKeyByHash).not.toHaveBeenCalled();
  });

  it("returns 401 { code, message } when the key is unknown or revoked", async () => {
    mockDeckCheckKeysRepo.findActiveKeyByHash.mockResolvedValue(undefined);
    const res = await push(
      { tournamentId: EVENT_ID, entries: [] },
      { Authorization: "Bearer nope" },
    );
    expect(res.status).toBe(401);
    expect(await readJson(res)).toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      message: "Unknown or revoked push key",
    });
  });

  it("returns 400 on a bad body, before the auth check (oRPC input validation)", async () => {
    const res = await push({ tournamentId: "not-a-uuid" }, { Authorization: "Bearer secret" });
    expect(res.status).toBe(400);
    // Validation runs before the handler, so the key is never looked up — this
    // preserves the previous validation-first ordering.
    expect(mockDeckCheckKeysRepo.findActiveKeyByHash).not.toHaveBeenCalled();
  });
});

describe("deck-check ingest body limit", () => {
  // Its own app: the limit is path middleware registered ahead of the oRPC
  // catch-all, so it has to be mounted the way app.ts does to be exercised.
  const limited = new Hono<{ Variables: Variables }>();
  mountDeckCheckIngestMiddleware(limited);
  limited.use("*", async (c, next) => {
    c.set("repos", { deckCheckKeys: mockDeckCheckKeysRepo } as never);
    c.set("config", { appBaseUrl: "https://openrift.test" } as never);
    await next();
  });
  registerRouterForTest(limited, deckCheckIngestRouter);

  it("rejects a push over 1 MB with a 413 the oRPC client can parse", async () => {
    const res = await limited.request("/api/v1/ingest/deck-check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({ tournamentId: EVENT_ID, note: "x".repeat(1024 * 1024) }),
    });

    expect(res.status).toBe(413);
    // A provider must get the same envelope here as for this endpoint's 401 /
    // 404 / 409: `defined` and `status` are what let the client rebuild the
    // error instead of discarding the body as a malformed response.
    expect(await readJson(res)).toStrictEqual({
      defined: false,
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      status: 413,
      message: "Push exceeds 1 MB",
    });
  });

  it("lets an under-cap push through to the router", async () => {
    mockDeckCheckKeysRepo.findActiveKeyByHash.mockResolvedValue(undefined);

    const res = await limited.request("/api/v1/ingest/deck-check", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer small" },
      body: JSON.stringify({ tournamentId: EVENT_ID, entries: [] }),
    });

    expect(res.status).toBe(401);
  });
});
